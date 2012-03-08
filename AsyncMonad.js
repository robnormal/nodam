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

function arrayOf(constructor) {
	return function(xs) {
		return _.isArray(xs) && _.all(xs, isInstanceof(constructor));
	};
}

function isInstanceof(constructor) {
	return function(x) {
		return x instanceof constructor;
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

function sequence(ms) {
	return ms.reduce(function (m1, m2) {
		return m1.then(m2);
	});
}

function AsyncMonad(success, failure) {
	this.x = success;
	this.fail = M.toMaybe(failure);
}

_.extend(AsyncMonad.prototype, Monad, {
	doBind: function(f) {
		var self = this;

		return new AsyncMonad(function (success, failure) {
			self.x(function (arg) {
				f(arg).x(success, failure);
			}, self.fail.or(failure));
		});
	},

	onErr: function(callback) {
		return new AsyncMonad(this.x, callback);
	},

	// start the chain of asynchronous actions
	run: function(success, failure) {
		this.x( success, this.fail.or(failure));
		// no return value, since all values are "returned" to callbacks
	},

	loopWhile: function(cond, wait) {
		var self = this;
		var delayer = wait ? setTimeout : process.nextTick;

		return new AsyncMonad(function (success, failure) {
			var recurse = function() {
				self.x(function (arg) {
					delayer(
						cond(arg) ?
							_.curry(recurse, success, failure) :
							_.curry(success, arg),
						wait || 0
					);
				}, self.fail.or(failure));
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
	return new AsyncMonad(function (callback, failure) {
		return callback(x);
	});
};

AsyncMonad.callCC = function(f) {
	return new AsyncMonad(function(success) {
		f(function(arg) {
			return new AsyncMonad(_.constant(success(arg)));
		}).x(success);
	});
};

var arrayOfAsync = arrayOf(AsyncMonad);

AsyncMonad.combine = function(monads) {
	if (! arrayOfAsync(monads)) {
		throw new Error('AsyncMonad.combine() requires an array of AsyncMonad objects');
	}

	var
		$has_finished = _.repeat(monads.length, false),
		$results = [],
		$exceptions = [],
		myCallback,
		finish;

	finish = function(index, result) {
		$results[index] = result;
		$has_finished[index] = true;

		if (_.and($has_finished)) {
			if (_.or($exceptions)) {
				// pass exceptions and returned data to next function
				myFailure($exceptions, $results);
			} else {
				myCallback($results);
			}
		}
	};

	return new AsyncMonad(function (success, failure) {
		myCallback = success;
		myFailure = failure;

		_.forOwn(monads, function(m, index) {
			m.run(
				function(x) { finish(index, x); }, 
				function(err) {
					$exceptions[index] = err;
					finish(index);
				}
			);
		});
	});
};

function asyncMonadConverter(convertCallback) {
	return function(f, options) {
		options = options || {};

		return function () {
			var owner, offset, args;
			var arity = options.arity,
				callback_pos = options.position,
				is_method = options.method;

			if (is_method) {
				owner = arguments[0];
				offset = 1;
			} else {
				offset = 0;
			}

			if (undefined === arity) {
				args = __slice.call(arguments);
				arity = args.length + 1;
			} else {
				// drop callback, if the user passes it by accident
				args = __slice.call(arguments, offset, arity - 1 - offset)

				// and warn them about it
				if (arguments.length > arity - 1) {
					throw new Error('Expected ' + (arity - 1) + ' arguments, got ' + arguments.length);
				}
			}

			callback_pos = undefined === callback_pos ? arity - 1 : callback_pos;

			return new AsyncMonad(function (success, failure) {
				var argsWithCallback = args
					.slice(0, callback_pos)
					.concat([ convertCallback(success, failure) ])
					.concat( args.slice(callback_pos) )
				;

				if (is_method) {
					owner[f].apply(owner, argsWithCallback);
				} else {
					f.apply(void 0, argsWithCallback);
				}
			});
		};
	};
}

var toAsyncMonad = asyncMonadConverter(_.identity);
var methodToAsyncMonad = function(method_name, options) {
	options = options || {};
	options.method = true;

	return toAsyncMonad(method_name, options);
}

// for functions that pass an error as the first argument
// to their callback, including those in fs, dns, child_process, and zlib
var errorPassingToAsyncMonad = asyncMonadConverter(function(success, failure) {
	return function() {
		// assume the first argument is an error
		var err = arguments[0];

		if (err) {
			failure(err);
		} else {
			// drop first argument, so the callback only sees the
			// meaningful arguments
			success.apply(void 0, __slice.call(arguments, 1));
		}
	};
});


// Can also be used for object methods
// usage: serverListen(server, host, port)
var serverListen = methodToAsyncMonad('listen');
var mySetTimeout = toAsyncMonad(setTimeout, { position: 0 });
var nextTick = toAsyncMonad(process.nextTick);
var log = liftM(console.log);

function fs() {
	var fs = require('fs');

	// convert all functions from fs to AsyncMonad functions
	// these are the number of arguments the funcitons take
	fs_functions = [
		'rename', 'truncate', 'chown', 'fchown', 'lchown',
		'chmod', 'fchmod', 'lchmod', 'stat', 'lstat',
		'fstat', 'link', 'symlink', 'readlink', 'realpath',
		'unlink', 'rmdir', 'mkdir', 'readdir', 'close',
		'open', 'utimes', 'futimes', 'fsync', 'write',
		'read', 'readFile', 'writeFile'
	];

	var asyncFs = {};
	_.forOwn(fs_functions, function(f) {
		asyncFs[f] = errorPassingToAsyncMonad(fs[f]);
	});

	return asyncFs;
}

function http() {
	var http = require('http');
	return {
		createServer: toAsyncMonad(http.createServer, 1),
		listen: methodToAsyncMonad('listen'),
		request: toAsyncMonad(http.request),
		get: toAsyncMonad(http.get),
		setTimeout: methodToAsyncMonad('setTimeout')
	};
}

function dns() {
	var dns_func = [
		'lookup', 'resolve', 'resolve4', 'resolve6', 'resolveMx',
		'resolveTxt', 'resolveSrv', 'reverse', 'resolveNs', 'resolveCname',
	];

	var dns = require('dns');
	var asyncDns = {};
	_.forOwn(dns_func, function(f) {
		asyncDns[f] = errorPassingToAsyncMonad(dns[f]);
	});

	return asyncDns;
}

// Make Maybe into a monad, so we can chain functions
// without checking for "nothing" every time
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

module.exports = {
	Monad: Monad,
	liftM: liftM,
	sequence: sequence,
	AsyncMonad: AsyncMonad,
	toAsyncMonad: toAsyncMonad,
	methodToAsyncMonad: methodToAsyncMonad,
	errorPassingToAsyncMonad: errorPassingToAsyncMonad,
	combine: AsyncMonad.combine,
	result: AsyncMonad.result,
	setTimeout: mySetTimeout,
	nextTick: nextTick,
	log: log,
	fs: fs,
	http: http,
	dns: dns
};

