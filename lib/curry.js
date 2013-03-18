/*jshint node: true, noarg: false */
// we need to use arguments.callee for the makeStack, a debug tool

var
	_ = require('underscore'),
	_slice = Array.prototype.slice,
	and, or, sum, fmap, flip,
	debug, debugging, mark$, markWrapper$;


/* Stack-free recursion
 *
 * This will call your function in a loop. If the return value is an
 * instance of Recurse, the "args" attribute (an array) will be used
 * as the arguments to your function in the next loop. Otherwise,
 * the value is returned.
 */
var recurse, recursive;
(function() {
	function Recurse(args, f) {
		this.args = args;
		this.f = f;
	}

	recursive = function(f) {
		var g = function() {
			var result = new Recurse(arguments);

			do {
				result = (result.f || f).apply(null, result.args);
			} while (result instanceof Recurse);

			return result;
		};

		markWrapper$(g, f, 'recurse');

		return g;
	};

	recurse = function(args, f) {
		return new Recurse(args, f);
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


var curry = _.partial;

/* Returns function that passes 'this' as first argument to f
** For attaching an already-defined function as an object method
*/
function curryThis(f) {
	var g = function() {
		if (this === global) {
			throw new Error('Cannot curry global object; you may be trying to ' +
				'pass an object method as an argument to a function. To do so, you ' +
				'need to bind the argument first, obj.method.bind(obj)'
			);
		} else {
			var $args = _slice.apply(arguments);
			$args.unshift(this);
			return f.apply(null, $args);
		}
	};

	markWrapper$(g, f, 'curryThis');

	return g;
}

/* Object-method version of "curry".  Returns a function that
 * calls the given method on its first argument, passing the given
 * arguments to it. Ex:
 *
 * responseType = method('setHeader', 'Content-Type');
 * // ...
 * responseType(server.response, 'text/html');
 */
function method(meth_name, args) {
	if (args && !(args instanceof Array)) {
		throw new TypeError('The second argument of method() must be an array');
	}

	return function(obj /* , further args */) {
		args = args || [];
		if (arguments.length > 1) {
			args = args.concat(_slice.call(arguments, 1));
		}

		return obj[meth_name].apply(obj, args);
	};
}

function methodOf(obj, meth_name) {
	return function() {
		return obj[meth_name].apply(obj, arguments);
	};
}

function madeAt(f) {
	if (! f) {
		throw new Error('not a function');
	} else if (! f._creation_stack) {
		if (! debugging()) {
			throw new Error('You need to call debug(true) to use madeAt()');
		} else {
			throw new Error('Function has no makeStack! ' +
				'Call makeStack() on the lambda function where it is created.'
			);
		}
	} else {
		return f._creation_stack.split(/\n\s+at\s+/)[2];
	}
}

function makeStack(f) {
	if (! f._creation_stack && debugging()) {
		f._creation_stack = (new Error()).stack;
		f._maker = arguments.callee.caller;
		f._made_at = madeAt(f);
	}

	return f;
}

/* Returns function that takes it's first two arguments
 * in reverse order
 */
function flip(f) {
	return function(/* x, y */) {
		var $args = _slice.apply(arguments), a;
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

/* 
 * Returns a function that passes it's argument list through g,
 * then calls f with that list
 */
function mapArgs(f, g) {
	return function () {
		return f.apply(void 0, g(_slice.call(arguments)));
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
	return mapArgs(f, function (args) {
		return args.slice(0, num_to_keep);
	});
}

/**
 * Removes num_to_drop arguments from the
 * beginning of the argument list
 */
// nip :: (a* -> b) -> Int -> (a* -> b)
function nip(f, num_to_drop) {
	return mapArgs(f, function (args) {
		return args.slice(num_to_drop);
	});
}

function mark(f) {
	var marked = f.curry();
	return mark$(marked, f);
}

function mark$(f) {
	if (f.marked) {
		return;
	} else {
		f.body = f.toString();
		f.time = (new Date()).getTime();
		f.stack = (new Error()).stack;
		f.marked = true;

		return f;
	}
}

function markWrapper$(f, original, wrapper_name) {
	f.wraps = original;
	f.wrapped = true;
	f.wrapper = wrapper_name;
}

function describeFunction(f) {
	return f.toString() + (f.wrapped ?
		"\nWrapping: " + describeFunction(f) : ''
	);
}






/**
 * No "each" function, because that is for side effects,
 * which we don't want
 */
function Stack(head, tail) {
	this.head = head;
	this.tail = tail;
	this.length = tail ? tail.length + 1 : 0;
}

Stack.prototype = {
	push: function(x) {
		return new Stack(x, this);
	},

	at: function(n) {
		var $t = this, i = 0;

		while ($t.tail && i < n) {
			$t = $t.tail;
			i++;
		}

		return $t.head;
	},

	each: function(f) {
		var $me = this.reverse();

		while($me.head !== undefined) {
			f($me.head);
			$me = $me.tail;
		}
	},

	map: function(f) {
		var $stack = new Stack();

		this.each(function(x) {
			$stack = $stack.push(f(x));
		});

		return $stack;
	},

	fold: function(f, memo) {
		if (! this.head) {
			return memo;
		} else if (! this.tail) {
			return f(this.head, memo);
		} else {
			return f(this.head, this.tail.fold(f, memo));
		}
	},

	reverse: function() {
		var $reverse = new Stack(), $self = this, len = this.length, i;

		for (i = 0; i < len; i++) {
			$reverse = $reverse.push($self.head);
			$self = $self.tail;
		}

		return $reverse;
	},

	flatten: function () {
		// skip fold, for efficiency's sake
		var $list = this.reverse(), $arr = [];

		while (undefined !== $list.head) {
			$arr.push($list.head);
			$list = $list.tail;
		}

		return $arr;
	}
};

function toStack(x) {
	var len = x.length, i, $list = new Stack();

	for (i = len - 1; i >= 0; --i) {
		$list = $list.push(x[i]);
	}

	return $list;
}


var lib = _.extend( {
	curry: curry,
	curryThis: curryThis,
	method: method,
	methodOf: methodOf,
	mapArgs: mapArgs,
	flip: flip,
	pare: pare,
	nip: nip,

	recursive: recursive,
	recurse: recurse,
	forOwn: forOwn,
	forOwnKeys: forOwnKeys,
	fold: fold,
	sum: sum,
	repeat: repeat,
	constant: constant,
	inert: inert,
	and: and,
	or: or,
	fmap: fmap,
	set: set,

	describeFunction: describeFunction,
	mark: mark,
	mark$: mark$,
	makeStack: makeStack,
	madeAt: madeAt,

	Stack: Stack
}, _);

// debug flag stuff
(function() {
	var makesFunction = {
		compose:    _.compose,
		curry:      curry,
		curryThis:  curryThis,
		method:     method,
		methodOf:   methodOf,
		mapArgs:    mapArgs,
		flip:       flip,
		pare:       pare,
		nip:        nip
	};

	var is_on = false;
	debug = function(bool) {
		is_on = bool;

		if (is_on) {
			// add makeStack functionality to functions that make functions
			_.each(makesFunction, function(f, name) {
				lib[name] = _.compose(makeStack, f);
			});
		} else {
			_.each(makesFunction, function(f, name) {
				lib[name] = f;
			});
		}
	}
	debugging = function() {
		return is_on;
	}
})();

lib.debug = debug;
lib.debugging = debugging;

module.exports = lib;
