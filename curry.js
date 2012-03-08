var __slice = Array.prototype.slice;
var and, or, sum, fmap;

var _ = require('underscore');

/* Stack-free recursion
 *
 * This will call your function in a loop. If the return value is an
 * instance of Recurse, the "args" attribute (an array) will be used
 * as the arguments to your function in the next loop. Otherwise,
 * the value is returned.
 */
var recurse;
(function() {
	function Recurse(args) {
		this.args = args;
	}

	recurse = function(f) {
		return function() {
			var result = new Recurse(arguments);

			do {
				result = f.apply(null, result.args);
			} while (result instanceof Recurse);

			return result;
		}
	};

	recurse.args = function(args) {
		return new Recurse(args);
	};
})();

function forOwn(obj, f) {
	for (var k in obj) {
		if (obj.hasOwnProperty(k)) {
			f(obj[k], k);
		}
	}
}

function forOwnKeys(obj, f) {
	return forOwn(obj, flip(f));
}


function curry(f) {
	var args = __slice.call(arguments, 1);
	return function () {
		return f.apply(void 0, args.concat( __slice.apply(arguments) ));
	};
}

/* Returns function that passes 'this' as first argument to f
** For attaching an already-defined function as an object method
*/
function curryThis(f) {
	return function() {
		if (this === global) {
			throw new Error('Cannot curry global object; you may be trying to ' +
				'pass an object method as an argument to a function. To do so, you ' +
				'need to bind the argument first, obj.method.bind(obj)'
			);
		} else {
			var $args = __slice.apply(arguments);
			$args.unshift(this);
			return f.apply(null, $args);
		}
	};
}

/* Object-method version of "curry".  Returns a function that
 * calls the given method on its first argument, passing the given
 * arguments to it. Ex:
 *
 * responseType = method('setHeader', 'Content-Type');
 * // ...
 * responseType(server.response, 'text/html');
 */
function method(method /*, args */) {
	var args;
	if (arguments.length > 1) {
		args = __slice.call(arguments, 1);
	}

	return function(/* obj, more args */) {
		var obj = arguments[0];

		if (arguments.length > 1) {
			args = args.concat(__slice.call(arguments, 1));
		}

		return obj[method].apply(obj, args);
	};
}


/* Returns function that takes it's first two arguments
 * in reverse order
 */
function flip(f) {
	return function(/* x, y */) {
		var $args = __slice.apply(arguments), a;
		a = $args[0];
		$args[0] = $args[1];
		$args[1] = a;

		return f.apply(void 0, $args);
	};
}

/* Reorders arguments to _.reduce, to make it more
 * functional-friendly
 */
function fold(f, memo, list) {
	return _.reduce(list, f, memo, undefined);
}

sum = curry(fold, function(memo, x) {
	return memo + x;
}, 0);
and = curry(flip(_.all), _.identity);
or  = curry(flip(_.any), _.identity);
fmap = flip(_.map);

// function that always returns x
function constant(x) {
	return function () {
		return x;
	};
}

// a function that does nothing
function inert() {}

function iterate(f, start, n) {
	if (n <= 0) return [];

	var $val = start,
			$result = [];

	for (var i = 0; i < n; i++) {
		$result.push($val);
		$val = f($val);
	}

	return $result;
}

function repeat(n, x) {
	return _.range(n).map(constant(x));
}

/**
 * Returns a copy of the object, with the given key set to the given val
 */
function set(obj, key, val) {
	var $cp = _.clone(obj);
	$cp[key] = val;

	return $cp;
}

/* Multivariable version of compose()
 *
 * Returns a function that calls f with new argument list
 * returned by argsFunc(arguments) - that is, called on
 * the arguments that get passed to the newly created function
 * if and when you call it
 */
function forArgs(f, argsFunc) {
	return function () {
		return f.apply(void 0, argsFunc(arguments));
	};
}

/**
 * Return a version of f that accepts at most
 * num_args_expected arguments.
 * Useful mapping/folding functions with optional arguments.
 *
 * Default: num_args_expected = 1
 */
// pare :: (a* -> b) -> Int -> (a* -> b)
function pare(f, num_to_keep) {
	return forArgs(f, function (args) {
		return __slice.call(args, 0, num_to_keep);
	});
}

/**
 * Removes num_to_drop arguments from the
 * beginning of the argument list
 */
// nip :: (a* -> b) -> Int -> (a* -> b)
function nip(f, num_to_drop) {
	return forArgs(f, function (args) {
		return __slice.call(args, num_to_drop);
	});
}

module.exports = _.extend( {
	curry: curry,
	curryThis: curryThis,
	method: method,
	recurse: recurse,
	forOwn: forOwn,
	forOwnKeys: forOwnKeys,
	forArgs: forArgs,
	flip: flip,
	fold: fold,
	sum: sum,
	pare: pare,
	nip: nip,
	repeat: repeat,
	constant: constant,
	inert: inert,
	and: and,
	or: or,
	fmap: fmap,
	set: set
}, _);


