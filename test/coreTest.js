var $ = require('../curry.js');
var M = require('../Maybe.js');

function doesntThrow(assert, f, err) {
	try {
		f();
	} catch (e) {
		assert.doesNotThrow(function () {
			throw e;
		}, err, e.toString());
	}
}

function display(f) {
	try {
		f();
	} catch(e) {
		console.log(e);
		throw e;
	}
}

module.exports = {
	'recurse allows you to implement recursion as a loop': function(_, assert) {
		var sum = (function() {
			var loop = $.recurse(function(x, i, arr) {
				return i < 0 ?
					$.recurse.result(x) :
					[x + arr[i], i-1, arr];
			});

			return function(arr) {
				return loop(0, arr.length - 1, arr);
			};
		})();
		
		assert.equal(sum([1, 4, 8]), 13);
	},
	'curryThis does what it says': function(_, assert) {
		var f = function(x, y) {
			return x.a + y;
		};

		obj = { a: 3 };
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

	'Maybe works as expected': function(_, assert) {
		assert.ok(M.nothing.isNothing());
		assert.ok(! M.nothing.isJust());

		assert.ok(M.just(4).isJust());
		assert.ok(! M.just(4).isNothing());
	}

};

