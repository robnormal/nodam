/*jshint node: true */

var $ = require('../lib/curry.js');
var M = require('../lib/Maybe.js');

function doesntThrow(assert, f, err) {
	try {
		f();
	} catch (e) {
		assert.doesNotThrow(function () {
			throw e;
		}, err, e.toString());
	}
}

module.exports = {
	'recursive allows you to implement recursion as a loop, ie tail-call recursion': function(_, assert) {

		var optimizedSum = (function(){

			// sums the first n elements of xs, add to sum
			var loop = $.recursive(function(xs, n, sum) {
				return n <= 0 || !xs || xs.length === 0 ?
					sum :
					$.recurse([xs, n - 1, sum + xs[n-1]]);
			});

			// sum all elements
			return function(xs) {
				return loop(xs, xs.length, 0);
			};
		})();

		var unoptimizedSum = (function() {
			var loop = function(xs, n, sum) {
				return n <= 0 || !xs || xs.length === 0 ?
					sum :
					loop(xs, n - 1, sum + xs[n-1]);
			};

			return function(xs) {
				return loop(xs, xs.length, 0);
			};
		})();

		assert.equal(optimizedSum([1, 4, 8]), 13);
		assert.equal(unoptimizedSum([1, 4, 8]), 13);

		// now sum a big array
		var $arr = [];
		for (var i = 100000; i > 0; i--) {
			$arr.push(i);
		}

		assert.throws(function() {
			unoptimizedSum($arr);
		}, RangeError, 'unoptimizedSum broke the stack');

		doesntThrow(assert, function() {
			optimizedSum($arr);
		}, RangeError, 'unoptimizedSum broke the stack');

		// 3x+1 problem, in mutual-recursion form
		var mutualA, mutualB;
		mutualA = $.recursive(function(x, steps) {
			return $.recurse([x, (steps) + 1], mutualB);
		});
		mutualB = $.recursive(function(x, steps) {
			if (x === 1) {
				return steps;
			} else {
				if (x % 2 === 0) {
					return $.recurse([x / 2, steps], mutualA);
				} else {
					return $.recurse([(3*x + 1) / 2, steps], mutualA);
				}
			}
		});
		var collatz = function(x) { return mutualA(x, 0); };

		doesntThrow(assert, function() {
			assert.equal(collatz(4), 3);
			assert.equal(collatz(5), 5);
		});
	},

	'curryThis does what it says': function(_, assert) {
		var f = function(x, y) {
			return x.a + y;
		};

		var obj = { a: 3 };
		obj.add = $.curryThis(f);

		assert.equal(obj.add(2), 5);
	},

	'method() returns a function which calls the given method on its argument': function(before, assert) {
		var upcase = $.method('toUpperCase');
		assert.equal(upcase('yo ho ho'), 'YO HO HO');

		var bowdlerize = $.method('replace', [/curses/, 'kisses']);
		assert.equal(bowdlerize('curses, foiled again'), 'kisses, foiled again',
			'passes extra arguments to object method');

		var i8n = $.method('replace', [/english/]);
		assert.equal(i8n('I speak english', 'deutsch'), 'I speak deutsch',
			'allows extra arguments when called');

		var count = 0;

		try {
			$.method('replace', /yo/, 'hi');
		} catch(e) {
			count++;
			assert.ok(e instanceof TypeError, 'throws an error if argument list is not an array');
		}

		before(function() {
			assert.equal(count, 1);
		});
	},

	'methodOf() allows an object\'s method to be called separate from it': function(before, assert) {
		var myReplace = $.methodOf('curses, foiled again', 'replace');

		assert.equal(myReplace(/curses/, 'kisses'), 'kisses, foiled again');
	},

	'compose() composes functions': function(_, assert) {
		var
			s = 'Abraham Lincoln',

			f = function(x) { return x.toString().split(' ')[0] },
			g = function(x) {
				// WTF? without using toString(), I get an error on split.
				return x.toString().split('').reverse().join('');
			};

		assert.equal(f(g(s)), $.compose(f, g)(s));
	},

	'mapArgs(f, g) is passes the output of g as the arguments to f': function(_, assert) {
		var
			a = 'the',
			b = 'happy',
			c = 'ax',

			f = function(x, y, z) { return x.length * y.length + z.length }, // f(a,b,c) = 17
			h = function(args) { return [args[0] + args[1], args[2], ''] }; // now 8 * 2 + 0 = 16

		assert.equal(f.apply(void 0, h([a, b, c])), $.mapArgs(f, h)(a, b, c));
	},

	'Maybe works as expected': function(_, assert) {
		assert.ok(M.nothing.isNothing());
		assert.ok(! M.nothing.isJust());

		assert.ok(M.just(4).isJust());
		assert.ok(! M.just(4).isNothing());
	},

	'Stack is a single-linked list': function(_, assert) {
		var s = new $.Stack();

		for (var i = 0; i < 10; i++) {
			s = s.push(i);
		}

		var sflat = s.flatten();

		assert.deepEqual(sflat, $.range(0, 10));
	},

	'debug() turns debugging on': function(_, assert) {
		if ($.debugging()) {
			console.error('$.debugging() should be false. ' +
				'Perhaps you forgot to turn it off in a previous test?');
		}

		$.debug(false);
		assert.equal($.debugging(), false);

		$.debug(true);
		assert.ok($.debugging());

		// clean up
		$.debug(false);
	},

	'makeStack adds a makeStack to a function if debugging is on': function(_, assert) {
		var f = function() {};

		$.makeStack(f);
		assert.equal(f._creation_stack, undefined, 'does nothing when debugging is off');

		$.debug(true);
		$.makeStack(f);

		assert.ok(f._creation_stack, 'adds _creation_stack');
		$.debug(false);
	},

	'madeAt returns origin from makeStack': function(_, assert) {
		var f = function() {};

		$.debug(true);
		$.makeStack(f);

		assert.ok($.madeAt(f).match(__filename),
			'madeAt returns proper filename (and, we hope, line number)'
		);
		$.debug(false);
	},

	'makeStack adds _maker property': function(_, assert) {
		$.debug(true);

		function createPred() {
			return $.makeStack(function(x) { return x - 1 });
		}

		var f = createPred();
		assert.equal(f._maker, createPred);
		$.debug(false);
	},

	'debug() adds makeStack to certain functions': function(_, assert) {
		var
			add = function(x) { return x+1 },
			mult = function(x) { return x*2 },
			add_mult = $.compose(mult, add);

		$.debug(true);

		var mult_add = $.compose(add, mult);

		assert.equal(add_mult._creation_stack, undefined, 'does not affect already created functions');
		assert.ok(mult_add._creation_stack, 'adds stack to newly created functions');
		assert.ok(
			mult_add && mult_add._creation_stack.match(__filename),
			'records file where it was created'
		);
		$.debug(false);
	}
};

