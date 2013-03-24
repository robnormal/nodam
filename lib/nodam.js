/*jshint node: true */
var
	_ = require('./curry.js'),
	M = require('./Maybe.js'),
	E = require('./Either.js'),
	R = require('./restriction.js'),
	util = require('util'),
	__slice = Array.prototype.slice,
	Monad, sequence, debug, debugging;

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
				throw new R.CheckError(msg(value));
			} else {
				throw new R.CheckError(msg || ('Bad return value: ' + value));
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

function Monad() {
	throw new R.CheckError('Monad is an abstract class');
}


_.extend(Monad.prototype, {
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

	/**
	 * Convenience method for when you are passing a value that
	 * is fmappable
	 */
	mmapFmap: function(f) {
		return this.mmap(function(u) { return u.fmap(f) });
	},

	pipeMmap: function(f) {
		var that = this;
		return this.pipe(function(us) {
			return that.constructor.mapM(us, f)
		});
	},

	pipeElse: function(f, m) {
		return this.pipe(function (m_u) {
			if (m_u.isNothing()) {
				return m;
			} else {
				return f(m_u.fromJust());
			}
		});
	},

	pipeMaybe: function(m, f) {
		return this.pipeElse(f, m);
	},

	// these are mostly internal
	// for "monad map"
	typed: function(f) {
		var that = this,
			pipeStack, g;

		if (debugging()) pipeStack = (new Error()).stack;

		g = typedFunction(isInstanceof(this.constructor), f,
			function(value) {
				return 'pipe() must return an instance of ' + that.constructor.name +
					', received ' + util.inspect(value) +
					(debugging() ? ('\npiper: ' + pipeStack + '\n/piper') : '');
			}
		);
		_.markWrapper$(g, f);
		g.pipeStack = pipeStack;

		return g;
	}
});

var monadicClassFunctions = {
	sequence: function(ms) {
		var that = this;

		var k = function(m1, m) {
			return m1.pipe(function(xs) {
				return m.pipe(function(x) {
					return that.result(xs.concat(x));
				});
			});
		};

		return _.reduce(ms, k, this.result([]));
	},
	sequence_: function(ms) {
		if (!ms.length) return this.result();

		var
			m = ms[0],
			i = 1,
			len = ms.length;

		for (; i < len; i++) {
			m = m.then(ms[i]);
		}

		return m;
	},
	fmapM: function(f, ms) {
		return this.sequence(_.map(ms, f));
	}
};

function monad$(construct, methods) {
	if (! methods.doBind) {
		throw new R.CheckError('Missing required Monad method doBind');
	} else if (! methods.result) {
		throw new R.CheckError('Missing required Monad method result');
	}

	_.extend(construct, monadicClassFunctions);
	_.extend(construct.prototype, Monad.prototype);

	construct.result = methods.result;
	construct.prototype.doBind = methods.doBind;
}

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
monad$(M.Maybe, {
	doBind: function(f) {
		if (this.isNothing()) {
			return this;
		} else {
			return f(this.fromJust());
		}
	},
	result: M.just
});


/** (Either(e, x) -> y) -> Object -> AsyncPass **/
function AsyncPass(success, state) {
	this.success = success;
	this.state = state;
}

AsyncPass.prototype.succeed = function(x) {
	this.success(x, this.state);
}

AsyncPass.prototype.setSuccess = function(callback) {
	return _.set(this, 'success', callback);
}

AsyncPass.prototype.setState = function(s) {
	return _.set(this, 'state', s);
}



/** (AsyncPass ->* a) -> Async **/
function Async(callback) {
	this.x = callback;
}

monad$(Async, {
	doBind: function(f) {
		var that = this;

		return new Async(function (mstuff) {
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

	result: function(x) {
		return new Async(function (apass) {
			return apass.success(E.right(x), apass.state);
		});
	}
});

_.extend(Async.prototype, {
	// uses setTimeout to pipe function in new thread
	pipe_: function(f) {
		var g = this.typed(f), that = this;

		return new Async(function (mstuff) {
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
					return Async.result(y);
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

	runIt: function(s) {
		return this.run(_.inert, _.inert, s);
	},

	rescue: function(f) {
		var that = this;

		return new Async(function (mstuff) {
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

		return new Async(function (mstuff) {
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

		return new Async(function (mstuff) {
			that.x(mstuff.setSuccess(function (_, ss) {
				mstuff.success(E.right(ss[key]), ss);
			}));
		});
	},

	set: function(key, val) {
		var that = this;

		return new Async(function (apass) {
			that.x(apass.setSuccess(function (o, ss) {
				if (o.isRight()) {
					apass.success(E.right(val), _.set(ss, key, val));
				} else {
					apass.success(o, ss);
				}
			}));
		});
	}

});

Async.setFor = function(key, val, m) {
	return Async.get(key).pipe(function(old) {
		return Async.set(key, val).then(m).set(key, old);
	});
};

function AsyncFailure(err) {
	this.err = err;
}

util.inherits(AsyncFailure, Async);

_.extend(AsyncFailure.prototype, {
	run: function(r, f, s) { f(this.err, s); },

	// not necessary, but more efficient
	pipe: function(f) { return this },
	doBind: function(f) { return this },

	rescue: function(f) {
		return Async.result(this.err).pipe(f);
	},

	x: function(apass) {
		apass.success(E.left(this.err), apass.state);
	}
});

Async.failure = function(err) {
	return new AsyncFailure(err);
};
Async.get = function(key) {
	return Async.result().get(key);
};
Async.set = function(key, val) {
	return Async.result().set(key, val);
};

Async.prototype.listen = function(obj, evName, f) {
	var that = this;
	return new Async(function (mstuff) {
		that.x(mstuff.setSuccess(function (arg, ss) {
			if (arg.isRight()) {
				// create separate thread here
				obj.on(evName, function(ev) {
					f(ev).x(mstuff);
				});
			}

			mstuff.success(arg, ss);
		}));
	});
};

Async.listen = function(obj, evName, f) {
	return Async.result().listen(obj, evName, f);
};


var arrayOfAsync = arrayOf(Async);

Async.combine = function(monads) {
	if (! arrayOfAsync(monads)) {
		throw new Error('Async.combine() requires an array of Async objects');
	}

	return new Async(function (apass) {
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

Async.combineStrict = function(monads) {
	return Async.combine(monads).pipe(function(eithers) {
		if (_.some(eithers, E.isLeft)) {
			return Async.error(E.lefts(eithers));
		} else {
			return Async.result(E.rights(eithers));
		}
	});
};

/*** helper functions for monadize ***/

/* for displaying helpful info in stack traces
 * info: {
 *   callback: name of function
 *   library: name of library
 *   owner: name of object whose method is called, if any
 *   arguments: arguments of original monad function
 *   stack: if debugging(), stack trace produced when monad was formed
 * }
 */
function describeMonad(f, args, options) {
	return {
		callback: options.name || (options.method && f),
		library: options.library,
		owner: options.method ? args[0] : undefined,
		arguments: args,
		stack: (new Error()).stack
	};
}


/**
 * Returns a callback for receiving the output of standard
 * node IO functions that do _not_ pass errors
 */
var noErrFunc = function(mstuff, options, that) {
	return function(u) {
		if (options.maybe) {
			u = M.toMaybe(u);
		}

		mstuff.success(E.right(u), mstuff.state);
	}
};

/**
 * Returns a callback for receiving the output of standard
 * node IO functions that pass errors as the first argument
 */
var errFunc = function(mstuff, options, that) {
	return function(err, u) {

		if (options.maybe) {
			u = M.toMaybe(u);
		}

		if (err && debugging()) err.stack = (new Error()).stack;

		mstuff.success(
			err ? E.left(err) : E.right(u),
			mstuff.state
		);
	}
};

function IOWrapper(io_obj) {
	this.io = io_obj;
}

/**
 * Turns a standard node IO funciton into a monadic one.
 *
 * options: {
 *   method: bool  -- if function is a method, the owner object must be
 *                    passed as first argument to the monadic function, and
 *                    the second will be an array of arguments for the method
 *                    (this is more convenient for library devel)
 *   errors: bool  -- whether the function being converted passes an error
 *                    as the first argument to its callback
 *   maybe: bool   -- If the first passed value (after error, if any) is
 *                    undefined, pass Nothing; else, Just(value)
 *   callback:
 */
function monadize(f, options) {
	return function() {
		if (options.arity && arguments.length < options.arity) {
			throw new Error('Expected ' + options.arity + ' arguments, only got ' + arguments.length);
		}

		var
			that = this,
			args = __slice.call(arguments),
			callback = options.callback || (options.errors ? errFunc : noErrFunc),
			asyncFunc, owner;

		if (options.method){
			asyncFunc = function(mstuff) {
				that.io[f].apply(that.io, args.concat(callback(mstuff, options, that)));
			};
		} else {
			asyncFunc = function(mstuff) {
				f.apply(undefined, args.concat(callback(mstuff, options, undefined)));
			};
		}

		if (debugging()) {
			return new Async(function(mstuff) {
				try {
					asyncFunc(mstuff);
				} catch(err) {
					err.monad = describeMonad(f, args, options);

					// throw informed error
					throw err;
				}
			});
		} else {
			return new Async(asyncFunc);
		}
	};
}


var convertLib = function(lib, errorlessFuncs, errorHandlingFuncs, options) {
	var
		libM = {},
		lib_name = options && options.library;

	_.each(errorlessFuncs, function(f) {
		libM[f] = monadize(lib[f], { name: f, library: lib_name });
	});

	_.each(errorHandlingFuncs, function(f) {
		libM[f] = monadize(lib[f], { errors: true, name: f, library: lib_name });
	});

	return libM;
};

/*** Monadic IO functions ***/
var logM = liftM(console.log);

function fs() {
	var fs = require('fs');
	var mfs = convertLib(fs, [], [
		'rename', 'truncate', 'chown', 'fchown', 'lchown',
		'chmod', 'fchmod', 'lchmod', 'stat', 'lstat',
		'fstat', 'link', 'symlink', 'readlink', 'realpath',
		'unlink', 'rmdir', 'mkdir', 'readdir', 'close',
		'open', 'utimes', 'futimes', 'fsync', 'write',
		'read', 'readFile', 'writeFile'
	], { library: 'fs' });

	// copy synchronouos funcitons
	mfs.createReadStream = fs.createReadStream;
	mfs.createWriteStream = fs.createWriteStream;

	return mfs;
}

function http() {
	var myhttp = require('http');

	return {
		// createServer: toAsync(myhttp.createServer, 1),
		createServer: myhttp.createServer,
		// request: toAsync(myhttp.request),
		// get: toAsync(myhttp.get),
		// usage: nodam.listen(server, host, port)
		// listen: methodToAsync('listen', { library: 'http', name: 'listen' }),
		// setTimeout: methodToAsync('setTimeout',
			// { library: 'http', name: 'setTimeout' })
	};
}


module.exports = {
	Monad: Monad,

	liftM: liftM,
	mcompose: mcompose,
	pipeline: pipeline,

	Async: Async,
	AsyncFailure: AsyncFailure,
	result: Async.result,
	failure: Async.failure,
	combine: Async.combine,
	combineStrict: Async.combineStrict,
	get: Async.get,
	set: Async.set,
	setFor: Async.setFor,

	monad$: monad$,
	IOWrapper: IOWrapper,
	monadize: monadize,

	debug: debug,
	debugging: debugging,

	logM: logM,
	http: http,
	fs: fs,
	Maybe: M,
	Either: E,
	_: _
};


