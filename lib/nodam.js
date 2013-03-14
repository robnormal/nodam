/*jshint node: true */

var __slice = Array.prototype.slice;
var Monad, sequence, AsyncMonad,
	liftM, StateMonad, StateReturn,
	toAsyncMonad, readFile, log;

var assert = require('assert');
var _ = require('./curry.js');
var M = require('./Maybe.js');

function typedFunction(fun_bool, f, msg) {
	return function() {
		var value = f.apply(this, arguments);
		if (fun_bool(value)) {
			return value;
		} else {
			throw new Error(msg || ('Bad return value: ' + value));
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
		return this.doBind(_.mark$(this.typed(mf), mf));
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

	// these are mostly internal
	doBind: function(f) {
		throw 'Implement doBind() on your DataType';
	},
	// for "monad map"
	typed: function(f) {
		return typedFunction(isInstanceof(this.constructor), f,
			'pipe() must return an instance of ' + this.constructor.name
		);
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
	// return _.compose(_.method('pipe', f2m), f1m);
	return function(x) {
		return f1M(x).pipe(f2M);
	}
}

var pipeline = function(fs) {
	if (fs.length) {
		var result = fs[0].constructor.result;

		return fs.reduce(mcompose, result);
	} else {
		throw new Error('Cannot create empty pipeline');
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

function AsyncMonad(callback, failure) {
	this.x = callback;
	this.fail = M.toMaybe(failure);
}

function traceLambda(f, prefix) {
	if (f.wraps && f.wraps.body) {
		traceLambda(f.wraps, '-' + prefix);
	}
}


_.extend(AsyncMonad.prototype, Monad, {
	doBind: function(f) {
		var self = this;

		return new AsyncMonad(function (success, failure, s) {
			self.x(function (arg, ss) {
				f(arg).x(success, failure, ss);
			}, self.fail.or(failure), s);
		});
	},

	// basically, we bind "return result(s[key])"
	get: function(key) {
		var self = this;

		return new AsyncMonad(function (success, failure, s) {
			self.x(function (o, ss) {
				success(ss[key], ss);
			}, self.fail.or(failure), s);
		});
	},

	set: function(key, val) {
		var self = this;

		return new AsyncMonad(function (success, failure, s) {
			self.x(function (o, ss) {
				success(val, _.set(ss, key, val));
			}, self.fail.or(failure), s);
		});
	},

	onErr: function(callback) {
		return new AsyncMonad(this.x, callback);
	},

	// start the chain of asynchronous actions
	run: function(success, failure, s) {
		this.x(success, this.fail.or(failure), s);
		// no return value, since all values are "returned" to callbacks
	},

	loopWhile: function(cond, wait) {
		var self = this;
		var delayer = wait ? setTimeout : process.nextTick;

		return new AsyncMonad(function (success, failure, s) {
			var recurse = function() {
				self.x(function (arg, ss) {
					delayer(
						cond(arg) ?
							_.curry(recurse, success, failure, ss) :
							_.curry(success, arg),
						wait || 0
					);
				}, self.fail.or(failure), s);
			};
			recurse();
		});
	},

	loop: function(n, wait_time) {
		return this.loopWhile(function() {
			return --n > 0;
		}, wait_time);
	},

	forever: function(wait_time) {
		return this.loopWhile(_.constant(true), wait_time);
	}

});

AsyncMonad.result = function(x) {
	// failure ignored, since result cannot fail
	return new AsyncMonad(function (callback, failure, s) {
		return callback(x, s);
	});
};

AsyncMonad.get = function(key) {
	return AsyncMonad.result().get(key);
};

AsyncMonad.callCC = function(f) {
	return new AsyncMonad(function(success, failure, s) {
		f(function(arg) {
			return new AsyncMonad(_.constant(success(arg, s)));
		}).x(success, failure, s);
	});
};

var arrayOfAsync = arrayOf(AsyncMonad);

AsyncMonad.combine = function(monads) {
	if (! arrayOfAsync(monads)) {
		throw new Error('AsyncMonad.combine() requires an array of AsyncMonad objects');
	}

	return new AsyncMonad(function (success, failure, s) {
		var
			$has_finished = _.repeat(monads.length, false),
			$results = [], $exceptions = [];

		var finish = function(index, result) {
			$results[index] = result;
			$has_finished[index] = true;

			if (_.and($has_finished)) {
				if (_.or($exceptions)) {
					// pass exceptions and returned data
					failure($exceptions, $results);
				} else {
					success($results, s);
				}
			}
		};

		_.each(monads, function(m, index) {
			m.run(
				_.curry(finish, index),
				function(err) {
					$exceptions[index] = err;
					finish(index);
				}, s);
		});
	});
};

function pad(len, arr) {
	if (arr.length < len) {
		return arr.concat(_.repeat(len - arr.length, undefined));
	} else {
		return arr;
	}
}

/* Returns a function that converts functions to AsyncMonad functions
 * convertCallback converts the callbacks produced by AsyncMonad
 * (one for success and one for failure) into * the form expected by 
 * the actual IO function.
 * E.g., for 'fs' functions, convertCallback produces a function that
 * passes its first argument, if defined, to the failure function, and
 * otherwise passes the rest of it's arguments to success
 */
function asyncMonadConverter(convertCallback) {
	return function(f, options) {
		options = options || {};

		return function () {
			var owner, offset, args;
			var
				arity        = options.arity,
				callback_pos = options.position,
				is_method    = options.method;

			if (is_method) {
				owner = arguments[0];
				if (undefined === owner) {
					throw new Error('Expected object for monadic method call; got ' + owner);
				} else if (undefined === owner[f]) {
					throw new Error('No method ' + f + ' exists for object ' + owner);
				}

				offset = 1;
			} else {
				offset = 0;
			}

			if (undefined === arity) {
				args = __slice.call(arguments);
				arity = args.length + 1;
			} else {
				// drop callback, if the user passes it by accident
				args = __slice.call(arguments, offset, arity - 1 - offset);

				// and warn them about it
				if (arguments.length > arity - 1) {
					throw new Error('Expected ' + (arity - 1) + ' arguments, got ' + arguments.length);
				}
			}

			// where the continuation callback is located
			callback_pos = undefined === callback_pos ? arity - 1 : callback_pos;

			return new AsyncMonad(function (success, failure, s) {
				var argsWithCallback = pad(callback_pos, args.slice(0, callback_pos))
					.concat([ convertCallback(success, failure, s) ])
					.concat( args.slice(callback_pos) )
				;

				if (is_method) {
					// don't pass the object as an argument
					owner[f].apply(owner, argsWithCallback.slice(1));
				} else {
					f.apply(void 0, argsWithCallback);
				}
			});
		};
	};
}

var toAsyncMonad = asyncMonadConverter(function(success, failure, s) {
	return function() {
		success.apply(void 0, __slice.call(arguments).concat(s));
	};
});

var methodToAsyncMonad = function(method_name, options) {
	options = options || {};
	options.method = true;

	return toAsyncMonad(method_name, options);
};

/* for functions that pass an error as the first argument
 * to their callback, including those in fs, dns, child_process, and zlib
 * See asyncMonadConverter
 */
var errorPassingToAsyncMonad = asyncMonadConverter(function(success, failure, s) {
	return function() {
		// assume the first argument is an error
		var err = arguments[0];

		if (err) {
			failure(err);
		} else {
			// drop first argument, so the callback only sees the
			// meaningful arguments
			success.apply(void 0, __slice.call(arguments, 1).concat(s));
		}
	};
});

var convertLib = function(lib, funcs, funcsWithErrors, methods, methodsWithErrs) {
	var libM = {};

	_.each(funcs, function(f) {
		libM[f] = toAsyncMonad(lib[f]);
	});

	_.each(funcsWithErrors, function(f) {
		libM[f] = errorPassingToAsyncMonad(lib[f]);
	});

	_.each(methods, function(f) {
		libM[f] = toAsyncMonad(lib[f], { method: true });
	});

	_.each(methodsWithErrs, function(f) {
		libM[f] = errorPassingToAsyncMonad(lib[f], { method: true });
	});

	return libM;
};

/*** Monadic IO functions ***/

var mySetTimeout = toAsyncMonad(setTimeout, { position: 0 });
var nextTick = toAsyncMonad(process.nextTick);
var log = liftM(console.log);

function fs() {
	return convertLib(require('fs'), [], [
		'rename', 'truncate', 'chown', 'fchown', 'lchown',
		'chmod', 'fchmod', 'lchmod', 'stat', 'lstat',
		'fstat', 'link', 'symlink', 'readlink', 'realpath',
		'unlink', 'rmdir', 'mkdir', 'readdir', 'close',
		'open', 'utimes', 'futimes', 'fsync', 'write',
		'read', 'readFile', 'writeFile'
	], [], []);
}

function http() {
	var myhttp = require('http');

	return {
		// createServer: toAsyncMonad(myhttp.createServer, 1),
		createServer: myhttp.createServer,
		// usage: nodam.listen(server, host, port)
		listen: methodToAsyncMonad('listen'),
		request: toAsyncMonad(myhttp.request),
		get: toAsyncMonad(myhttp.get),
		setTimeout: methodToAsyncMonad('setTimeout')
	};
}

function dns() {
	return convertLib(require('dns'), [], [
		'lookup', 'resolve', 'resolve4', 'resolve6', 'resolveMx',
		'resolveTxt', 'resolveSrv', 'reverse', 'resolveNs', 'resolveCname'
	], [], []);
}

module.exports = {
	Monad: Monad,
	liftM: liftM,
	sequence: sequence,
	sequence_: sequence_,
	AsyncMonad: AsyncMonad,
	combine: AsyncMonad.combine,
	result: AsyncMonad.result,
	get: AsyncMonad.get,
	pipeline: pipeline,

	toAsyncMonad: toAsyncMonad,
	methodToAsyncMonad: methodToAsyncMonad,
	errorPassingToAsyncMonad: errorPassingToAsyncMonad,
	convertLib: convertLib,
	setTimeout: mySetTimeout,
	nextTick: nextTick,
	log: log,
	fs: fs,
	http: http,
	dns: dns,

	Maybe: M,
	_: _
};

