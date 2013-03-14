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

	'method() returns a function which calls the given method on its argument': function(_, assert) {
		var upcase = $.method('toUpperCase');
		assert.equal(upcase('yo ho ho'), 'YO HO HO');

		var bowdlerize = $.method('replace', /curses/, 'kisses');
		assert.equal(bowdlerize('curses, foiled again'), 'kisses, foiled again',
			'passes extra arguments to object method');

		var i8n = $.method('replace', /english/);
		assert.equal(i8n('I speak english', 'deutsch'), 'I speak deutsch',
			'allows extra arguments when called');
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

			f = function(x, y, z) { return x.length * y.length + z.length }; // f(a,b,c) = 17
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
	}

};

