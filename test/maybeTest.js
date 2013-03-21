/*jshint node: true */

var $ = require('../lib/curry.js');
var M = require('../lib/Maybe.js');
var E = require('../lib/Either.js');

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
	'just().isJust() and nothing.isNothing()': function(_, assert) {
		assert.ok(M.nothing.isNothing());
		assert.ok(! M.nothing.isJust());

		assert.ok(M.just(4).isJust());
		assert.ok(! M.just(4).isNothing());
	},

	'fromJust() retrieves value from just, or throws error if nothing': function(_, assert) {
		var threw = false;

		assert.equal(M.just(4).fromJust(), 4, 'returned value from Just');

		try {
			M.nothing.fromJust();
		} catch(e) {
			threw = true;
		}

		assert.ok(threw, 'threw error for Nothing');
	},

	'fmap() maps just value': function(_, assert) {
		var f = function(x) { return 2*x };
		assert.equal(M.just(3).fmap(f).fromJust(), 6);
		assert.ok(M.nothing.fmap(f).isNothing());
	},

	'or() returns the just value, or the second argument if nothing': function(_, assert) {
		assert.equal(M.just(3).or(5), 3);
		assert.equal(M.nothing.or(5), 5);
	},

	'Either::right().isRight() and Either::left().isLeft()': function(_, assert) {
		assert.ok(E.right(3).isRight());
		assert.ok(! E.left('Nope').isRight());

		assert.ok(E.left('Nope').isLeft());
		assert.ok(! E.right(4).isLeft());
	},

	'fromRight() retrieves value from Right, or throws error if Left': function(_, assert) {
		var threw = false;

		assert.equal(E.right(4).fromRight(), 4, 'returned value from Right');

		try {
			E.left('Bad').fromRight();
		} catch(e) {
			threw = true;
		}

		assert.ok(threw, 'threw error for Left');
	},

	'fromLeft() is vice versa of fromRight()': function(_, assert) {
		var threw = false;

		assert.equal(E.left('Boo').fromLeft(), 'Boo', 'returned value from Left');

		try {
			E.right(6).fromLeft();
		} catch(e) {
			threw = true;
		}

		assert.ok(threw, 'threw error for Right');
	}


}
