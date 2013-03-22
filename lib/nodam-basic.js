/*jshint node: true */
var
	_ = require('./curry.js'),
	M = require('./Maybe.js'),
	E = require('./Either.js'),
	util = require('util'),
  makeStack = _.makeStack,
	__slice = Array.prototype.slice,
	Monad, sequence, toAsyncMonad, debug, debugging;

// require('longjohn').async_trace_limit = -1;

// debug flag stuff
(function() {
	var on = false;
	debug = function(bool) {
		on = bool;

		// must activate debugging on curry, or we can't debug nodam
		if (on) {
			_.debug(true);
		}
	}
	debugging = function() {
		return on;
	}
})();

function typedFunction(fun_bool, f, msg) {
	return function() {
		var value = f.apply(this, arguments);
		if (fun_bool(value)) {
			return value;
		} else {
			if (msg instanceof Function) {
				throw new Error(msg(value));
			} else {
				throw new Error(msg || ('Bad return value: ' + value));
			}
		}
	};
}

function isInstanceof(constructor) {
	return function(x) {
		return x instanceof constructor;
	};
}

function arrayOf(constructor) {
	return function(xs) {
		return _.isArray(xs) && _.all(xs, isInstanceof(constructor));
	};
}

function applier(f) {
	return function(args) {
		return f.apply(null, args);
	};
}

Monad = {
	pipe: function(mf) {
		return this.doBind(this.typed(mf));
	},
	// useful when you have a "multivariable" monad, i.e.,
	// when you have a list of distinct values inside the 
	// monad that you want to break apart for your function,
	// instead of having to do it explicitly inside the function
	pipeArray: function(f) {
		return this.pipe(applier(f));
	},
	then: function(m) {
		return this.pipe(_.constant(m));
	},
	mmap: function(f) {
		return this.pipe(_.compose(this.constructor.result || Monad.result, f));
	},
	map: function() {
		throw new Error('Monad has no method "map". Perhaps you meant "mmap"?');
	},
	// these are mostly internal
	doBind: function(f) {
		throw new Error('Implement doBind() on your DataType');
	},
	// for "monad map"
	typed: function(f) {
		var that = this;
		var g = typedFunction(isInstanceof(this.constructor), f,
			function(value) {
				return 'pipe() must return an instance of ' + that.constructor.name +
					', received ' + util.inspect(value);
			}
		);
		_.mark$(g, f);
		if (debugging()) g.piper = (new Error()).stack.split(/\n\s+at\s+/g)[2];

		return g;
	}
};
Monad.result = function(_) {
	throw new Error('Monad: must implement result() on your constructor');
};

// works for any monad
function liftM(f) {
	return function (monad) {
		if (monad.pipe && monad.constructor.result) {
			return monad.pipe(function (inside) {
				return monad.constructor.result(f(inside));
			});
		} else {
			throw 'argument to lifted function must be a Monad';
		}
	};
}

var sequence = (function() {
	var addNext = function(vals, ms, m, i) {
		return m.pipe(function(x) {
			vals.push(x);

			return ms[i];
		});
	};

	return function(ms) {
		var monad = ms[0].constructor;
		var i,
			vals = [],
			m = ms[0],
			len = ms.length;

		for (i = 1; i < len; i++) {
			m = addNext(vals, ms, m, i);
		}

		return m.pipe(function(last) {
			vals.push(last);

			return monad.result(vals);
		});
	};
})();

var sequence_ = function(ms) {
	var m = ms[0];

	for (var i = 1, len = ms.length; i < len; i++) {
		m = m.then(ms[i]);
	}

	return m;
};

/*
 * mcompose = (f1M, f2M) -> (x) -> f1M(x).pipe(f2M)
 */
function mcompose(f1M, f2M) {
	// return _.compose(_.method('pipe', [f2m]), f1m);
	return function(x) {
		return f1M(x).pipe(f2M);
	}
}

var pipeline = function(fs) {
	var len = (fs && fs.length) || 0;

	if (! len) {
		throw new Error('Cannot create empty pipeline');
	} else if (len === 1) {
		return fs[0];
	} else {
		return mcompose(fs[0], pipeline(fs.slice(1)));
	}
};

/* Make Maybe into a monad, so we can chain functions
 * without checking for "nothing" every time
 */
_.extend(M.Maybe.prototype, Monad, {
	doBind: function(f) {
		if (this.isNothing()) {
			return this;
		} else {
			return f(this.fromJust());
		}
	}
});
M.Maybe.result = M.just;


function traceLambda(f, prefix) {
	if (f.wraps && f.wraps.body) {
		traceLambda(f.wraps, '-' + prefix);
	}
}

/** (Either(e, x) -> y) -> Object -> AsyncPass **/
function AsyncPass(success, state) {
	this.success = success;
	this.state = state;
}

AsyncPass.prototype.setSuccess = function(callback) {
	return _.set(this, 'success', callback);
}

AsyncPass.prototype.setState = function(s) {
	return _.set(this, 'state', s);
}


/** (AsyncPass ->* a) -> AsyncMonad **/
function AsyncMonad(callback) {
	this.x = callback;
}

function setState(obj, state) {
	return _.set(obj, 'state', state);
}

function setSuccess(obj, success) {
	return _.set(obj, 'success', success);
}

_.extend(AsyncMonad.prototype, Monad, {
	doBind: function(f) {
		var that = this;

		return new AsyncMonad(function (mstuff) {
			that.x(mstuff.setSuccess(function (arg, ss) {
				if (arg.isRight()) {
					f(arg.fromRight()).x(mstuff.setState(ss));
				} else {
					// just go on - call with same left argument
					mstuff.success(arg, ss);
				}
			}));
		});
	},

	// uses setTimeout to pipe function in new thread
	pipe_: function(f) {
		var g = this.typed(f), that = this;

		return new AsyncMonad(function (mstuff) {
			setTimeout(function() {
				that.x(mstuff.setSuccess(function (arg, ss) {
					if (arg.isRight()) {
						g(arg.fromRight()).x(mstuff.setState(ss));
					} else {
						// just go on - call with same left argument
						mstuff.success(arg, ss);
					}
				}));
			}, 0);
		});
	},

	then_: function(m) {
		return this.pipe_(_.constant(m));
	},

	loopWhile: function(cond, f) {
		var recur = function(x) {
			return f(x).pipe_(function(y) {
				if (cond(y)) {
					return recur(y);
				} else {
					return AsyncMonad.result(y);
				}
			});
		};

		return this.pipe(recur);
	},

	loop: function(f) {
		var recur = function(x) {
			return f(x).pipe_(recur);
		}

		return this.pipe(recur);
	},

	forever: function() {
		return this.loop(_.constant(this));
	},

	// start the chain of asynchronous actions
	run: function(success, failure, s) {
		// no return value, since all values are "returned" to callbacks
		this.x(new AsyncPass(function(e_x, ss) {
			if (e_x.isRight()) {
				success(e_x.fromRight(), ss);
			} else {
				failure(e_x.fromLeft(), ss);
			}
		}, s));
	},

	rescue: function(f) {
		var that = this;

		return new AsyncMonad(function (mstuff) {
			that.x(mstuff.setSuccess(function (arg, ss) {
				if (arg.isRight()) {
					mstuff.success(arg, ss);
				} else {
					f(arg.fromLeft()).x(mstuff.setState(ss));
				}
			}));
		});
	},

	rescueOnly: function(type, f) {
		var that = this;

		return new AsyncMonad(function (mstuff) {
			that.x(mstuff.setSuccess(function (arg, ss) {
				var left;

				if (
					arg.isLeft() &&
					(left = arg.fromLeft()) instanceof type
				) {
					f(left).x(mstuff.setState(ss));
				} else {
					mstuff.success(arg, ss);
				}
			}));
		});
	},

	/** State Monad functions **/
	get: function(key) {
		var that = this;

		return new AsyncMonad(function (mstuff) {
			that.x(mstuff.setSuccess(function (_, ss) {
				mstuff.success(E.right(ss[key]), ss);
			}));
		});
	},

	set: function(key, val) {
		var that = this;

		return new AsyncMonad(function (apass) {
			that.x(apass.setSuccess(function (o, ss) {
				apass.success(E.right(val), _.set(ss, key, val));
			}));
		});
	}

});

function AsyncFailure(err) {
	this.err = err;
	this.x = function(apass) {
		apass.success(E.left(err), apass.state);
	}
}

require('util').inherits(AsyncFailure, AsyncMonad);
_.extend(AsyncFailure.prototype, {
	run: function(r, f, s) { f(this.err, s); },

	// not necessary, but more efficient
	pipe: function(f) { return this },
	doBind: function(f) { return this },

	rescue: function(f) {
		var that = this;

		return new AsyncMonad(function (apass) {
			f(that.err).x(apass);
		});
	}
});

AsyncMonad.result = function(x) {
	return new AsyncMonad(function (apass) {
		return apass.success(E.right(x), apass.state);
	});
};
AsyncMonad.failure = function(err) {
	return new AsyncFailure(err);
};
AsyncMonad.get = function(key) {
	return AsyncMonad.result().get(key);
};
AsyncMonad.set = function(key, val) {
	return AsyncMonad.result().set(key, val);
};



function isInstanceof(constructor) {
	return function(x) {
		return x instanceof constructor;
	};
}
function arrayOf(constructor) {
	return function(xs) {
		return _.isArray(xs) && _.all(xs, isInstanceof(constructor));
	};
}

var arrayOfAsync = arrayOf(AsyncMonad);

AsyncMonad.combine = function(monads) {
	if (! arrayOfAsync(monads)) {
		throw new Error('AsyncMonad.combine() requires an array of AsyncMonad objects');
	}

	return new AsyncMonad(function (apass) {
		var
			$has_finished = _.repeat(monads.length, false),
			$results = [],

			finish = function(succeeded, index, result) {
				$has_finished[index] = true;
				$results[index] = succeeded ?
					E.right(result) :
					E.left(result);

				if (_.and($has_finished)) {
					apass.success(E.right($results), apass.state);
				}
			};

		_.each(monads, function(m, index) {
			m.run(
				_.curry(finish, true, index),
				_.curry(finish, false, index),
				apass.state
			);
		});
	});
};

AsyncMonad.combineStrict = function(monads) {
	return AsyncMonad.combine(monads).pipe(function(eithers) {
		if (_.some(eithers, E.isLeft)) {
			return AsyncMonad.error(E.lefts(eithers));
		} else {
			return AsyncMonad.result(E.rights(eithers));
		}
	});
};


function pad(len, arr) {
	if (arr.length < len) {
		return arr.concat(_.repeat(len - arr.length, undefined));
	} else {
		return arr;
	}
}

/* for displaying helpful info in stack traces
 * info: {
 *   callback: name of function
 *   library: name of library
 *   method: name of method, callback is a method
 *   owner: name of object whose method is called, if any
 *   arguments: arguments of original monad function
 *   stack: if debugging(), stack trace produced when monad was formed
 * }
 */
function describeMonad(info, stack) {
	if (debugging()) info.stack_at_origin = stack;

	return info;
}

function errorHandlingCallback(f) {
	return function() {
		var args = __slice.call(arguments);

		return new AsyncMonad(function(mstuff) {

			// FIXME: is there any functiont that passes
			// more than 2 arguments to its callback?

			f.apply(void 0, args.concat(function(err, u) {
				mstuff.success(
					err ? E.left(err) : E.right(u),
					mstuff.state
				);
			}));
		});
	}
}

function errorlessCallback(f) {
	return function() {
		var args = __slice.call(arguments);

		return new AsyncMonad(function(mstuff) {
			f.apply(void 0, args.concat(function(u) {
				mstuff.success(E.right(u), mstuff.state);
			}));
		});
	}
}

function errorHandlingCallback(f) {
	return function() {
		var args = __slice.call(arguments);

		return new AsyncMonad(function(mstuff) {

			// FIXME: is there any functiont that passes
			// more than 2 arguments to its callback?

			f.apply(void 0, args.concat(function(err, u) {
				mstuff.success(
					err ? E.left(err) : E.right(u),
					mstuff.state
				);
			}));
		});
	}
}

var convertLib = function(lib, errorlessFuncs, errorHandlingFuncs, options) {
	var
		libM = {},
		lib_name = options && options.library;

	_.each(errorlessFuncs, function(f) {
		libM[f] = errorlessCallback(lib[f], { name: f, library: lib_name });
	});

	_.each(errorHandlingFuncs, function(f) {
		libM[f] = errorHandlingCallback(lib[f], { name: f, library: lib_name });
	});

	return libM;
};

/*** Monadic IO functions ***/
var logM = liftM(console.log);

function fs() {
	return convertLib(require('fs'), [], [
		'rename', 'truncate', 'chown', 'fchown', 'lchown',
		'chmod', 'fchmod', 'lchmod', 'stat', 'lstat',
		'fstat', 'link', 'symlink', 'readlink', 'realpath',
		'unlink', 'rmdir', 'mkdir', 'readdir', 'close',
		'open', 'utimes', 'futimes', 'fsync', 'write',
		'read', 'readFile', 'writeFile'
	], { library: 'fs' });
}

function http() {
	var myhttp = require('http');

	return {
		// createServer: toAsyncMonad(myhttp.createServer, 1),
		createServer: myhttp.createServer,
		// request: toAsyncMonad(myhttp.request),
		// get: toAsyncMonad(myhttp.get),
		// usage: nodam.listen(server, host, port)
		// listen: methodToAsyncMonad('listen', { library: 'http', name: 'listen' }),
		// setTimeout: methodToAsyncMonad('setTimeout',
			// { library: 'http', name: 'setTimeout' })
	};
}


module.exports = {
	Monad: Monad,

	liftM: liftM,
	sequence: sequence,
	sequence_: sequence_,
	pipeline: pipeline,

	AsyncMonad: AsyncMonad,
	AsyncFailure: AsyncFailure,
	result: AsyncMonad.result,
	failure: AsyncMonad.failure,
	get: AsyncMonad.get,
	set: AsyncMonad.set,

	debug: debug,
	debugging: debugging,

	fs: fs,
	Maybe: M,
	Either: E,
	_: _
};


