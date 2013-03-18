/*jshint node: true */
var R = require('../lib/restriction.js');
var $ = require('../lib/curry.js');

module.exports = {
	'Restrictions': function(_, assert) {
		$.debug(true);

		// check that the first arg is greater than the second,
		// and that the second is greater than 0
		var rr1 = $.restriction(function(x, y) {
			return x > y && y > 0;
		}, [0, 1]);

		var msg2 = 'Third argument must have method "match"';

		// check that the third argument has a method "match"
		var rr2 = $.restriction(function(x) {
			return x && x.match;
		}, [2], msg2);

		var rr3 = rr1.and(rr2);

		var good_args = [4, 2, 'x'];
		var bad_args  = [6, 1, 2993];

		assert.isUndefined(rr1.check(good_args));
		assert.isUndefined(rr2.check(good_args));
		assert.isUndefined(rr3.check(good_args), '"and" function works');

		assert.type(rr1.check([1, 6]), 'string');
		assert.equal(rr2.check(bad_args), msg2);
		assert.equal(rr3.check(bad_args), msg2, '"and" function works');

		var count = 0;
		try {
			$.restrict(rr3, function(a, b, c) {
			})(6, 1, 2993);
		} catch (e) {
			assert.ok(e instanceof $.RestrictionError);
			count++;
		}

		assert.equal(count, 1, 'restricted function throws error on bad arguments');

		$.debug(false);

		try {
			$.restrict(rr3, function(a, b, c) {
			})(6, 1, 2993);

			assert.ok(true, 'restrict does nothing if not debugging');
		} catch (e) {
			assert.fail('restrict does nothing if not debugging');
		}
	}
};
