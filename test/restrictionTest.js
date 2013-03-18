/*jshint node: true */
var R = require('../lib/restriction.js');
var $ = require('../lib/curry.js');

module.exports = {
	'Restrictions': function(_, assert) {
		$.debug(true);

		// check that the first arg is greater than the second,
		// and that the second is greater than 0
		var rr1 = R.restriction(function(x, y) {
			return x > y && y > 0;
		}, [0, 1]);

		var msg2 = 'Third argument must have method "match"';

		// check that the third argument has a method "match"
		var rr2 = R.restriction(function(x) {
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
			R.restrictArgs(rr3, function(a, b, c) {
			})(6, 1, 2993);
		} catch (e) {
			if (! (e instanceof R.RestrictionError)) throw e;
			count++;
		}

		assert.equal(count, 1, 'restricted function throws error on bad arguments');

		$.debug(false);

		try {
			R.restrictArgs(rr3, function(a, b, c) {
			})(6, 1, 2993);

			assert.ok(true, 'restrict does nothing if not debugging');
		} catch (e) {
			assert.fail('restrict does nothing if not debugging');
		}
	},

	'arity': function(before, assert) {
		var f = function(x, y) {
			return x;
		}

		$.debug(true);
		var g = R.arity(2, f);
		var h = R.arity(3, f);
		$.debug(false);
		var j = R.arity(3, f);

		var count = 0;

		try {
			g(2, 3);
			count++;
		} catch(e) {
			assert.fail('proper arity should not throw an error');
		}

		try {
			h(2, 3);
			assert.fail('wrong arity causes error');
		} catch(e) {
			if (! (e instanceof R.RestrictionError)) throw e;
			count++;
		}

		try {
			j(2, 3);
			count++;
		} catch(e) {
			assert.fail('should only work when debugging is on');
		}

		assert.equal(count, 3);
	},

	'Various Restrictions': function(before, assert) {
		$.debug(true);
		var count = 0;

		var f = R.restrictArgs(R.isFunctionAt(0, 'first should be function'), function(a,b,c) {});
		var g = R.restrictArgs(R.isTypeAt(Function, 0, 'first should be function'), function(a,b,c) {});

		try {
			f(3);
			assert.fail('non-function argument throws error');
		} catch(e) {
			if (! (e instanceof R.RestrictionError)) {
				throw e;
			}
			count++;
		}

		try {
			f(function() {});
			count++;
		} catch(e) {
			if (! (e instanceof R.RestrictionError)) throw e;
			assert.fail('function argument should not throw error');
		}

		try {
			g(3);
			assert.fail('non-function argument throws error');
		} catch(e) {
			if (! (e instanceof R.RestrictionError)) throw e;
			count++;
		}

		var h = R.restrictArgs(R.isDefinedAt(1, 'second arg should be defined'), function() {});
		$.debug(false);

		try {
			h(3);
			assert.fail('undefined second argument throws error');
		} catch(e) {
			if (! (e instanceof R.RestrictionError)) throw e;
			count++;
		}

		assert.equal(count, 4);
	},

	'transforms': function(before, assert) {
		$.debug(true);
		var
			t = function(args) {
				return [args[0] + args[1], args[1]];
			},
			r = new R.Restriction($.constant(null), t),
			rr = R.transforms(t),

			f = function(a,b) {
				return a + ':' + b;
			},
			g = R.restrictArgs(r, f),
			h = R.restrictArgs(rr, f);

		assert.equal(g(3, 5), '8:5');
		assert.equal(h(3, 5), '8:5');

		var
			rr2 = new R.Restriction(function() {
			}, function(args) {
				return $.map(args, function(x) { return x - 1; });
			}),
			r2 = rr2.and(rr),
			r3 = rr.and(rr2);

		assert.equal(R.restrictArgs(r2, f)(3, 5), '7:4');
		assert.equal(R.restrictArgs(r3, f)(3, 5), '6:4');

		$.debug(false);
	},

	'typedFunction': function(before, assert) {
		$.debug(true);

		var
			count = 0,
			f = function(a, f) {
				f(3);
			},
			must_have_first = R.isDefinedAt(0, 'first arg should be defined'),
			r = R.typedFunction(must_have_first, 1, 'Function must satisfy:');

		try {
			R.restrictArgs(r, function(x,f) {
				f(x); // first argument is defined
			})(4, 6);

			assert.fail('non-function argument should throw error');
		} catch (e) {
			if (! (e instanceof R.RestrictionError)) {
				throw e;
			}
			count++;
		}

		try {
			R.restrictArgs(r, function(x,f) {
				f(x); // first argument is defined
			})(4, function() {});
			count++;
		} catch (e) {
			if (! (e instanceof R.RestrictionError)) {
				throw e;
			}
			console.log(e);
			assert.fail('proper arguments to passed function do not throw error');
		}

		try {
			R.restrictArgs(r, function(x,f) {
				f(); // no first argument
			})(4, function() {});
			assert.fail('bad arguments to passed function throw error');
		} catch (e) {
			if (! (e instanceof R.RestrictionError)) throw e;
			count++;
		}

		assert.equal(count, 3);
		$.debug(false);
	},

	'Restrict return values':  function(before, assert) {
		$.debug(true);

		// a function that throws an error if its argument is undefined
		var
			count = 0,
			checkExists = R.restrictReturn(R.isDefined(), $.identity);

		try {
			checkExists(3);
		} catch (e) {
			if (! (e instanceof R.RestrictionError)) throw e;
			console.log(e);
			assert.fail('defined argument does not throw an error');
		}

		try {
			checkExists(count.blahblah);
			assert.fail('undefined argument throws an error');
		} catch (e) {
			if (! (e instanceof R.CheckError)) throw e;
			count++;
		}

		assert.equal(count, 1);
		$.debug(false);
	}
};
