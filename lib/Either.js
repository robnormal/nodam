/*jshint node: true */
var _ = require('./curry.js');

var semaphoreB = {};
var Either = function (l, r, is_left, flag) {
	if (flag !== semaphoreB) {
		throw new Error(
			'Do not call Either directly. Use left() or right()'
		);
	} else {
		var bool_left = !!is_left;

		this.isLeft = function() {
			return bool_left;
		};

		this.fromLeft = function() {
			if (this.isLeft()) {
				return l;
			} else {
				throw new Error('Cannot call fromLeft() on Right');
			}
		};

		this.fromRight = function() {
			if (this.isRight()) {
				return r;
			} else {
				throw new Error('Cannot call fromRight() on Left');
			}
		};
	}
};

_.extend(Either, {
	fmap: function(e, f) {
		if (e.isLeft()) {
			return e;
		} else {
			return Either.right(f(e.fromRight()));
		}
	},
	isRight: function(e) {
		return ! e.isLeft();
	},
	leftMap: function(e, f) {
		if (e.isLeft()) {
			return Either.left( f(e.fromLeft()) );
		} else {
			return e;
		}
	},
	either: function(e, rf, lf) {
		if (e.isLeft()) {
			return lf(e.fromLeft());
		} else {
			return rf(e.fromRight());
		}
	},

	// must be defined on the object, since it has a private variable
	isLeft: function(e) {
		return e.isLeft();
	},

	right: function(x) {
		return new Either(null, x, false, semaphoreB);
	},
	left: function(err) {
		return new Either(err, null, true, semaphoreB);
	},
	toEither: function(x, err) {
		return void 0 === x || null === x ?
			Either.left(err) : Either.right(x);
	},

	rights: function(es) {
		return _.reduce(es, function(memo, e) {
			return e.isRight() ? memo.concat([e.fromRight()]) : memo;
		}, []);
	},
	lefts: function(es) {
		return _.reduce(es, function(memo, e) {
			return e.isLeft() ? memo.push(e.fromLeft()) : memo;
		}, []);
	},
});

// don't use _.partial, it makes it hard to trace errors
Either.prototype = {
	isRight: function() { return Either.isRight(this) },
	fmap:    function(f) { return Either.fmap(this, f) },
	leftMap: function(f) { return Either.leftMap(this, f) },
	either: function(rf, lf) { return Either.either(this, rf, lf) }
};

var x = _.extend({
	Either: Either
}, Either);

// export all static functions on Either, and Either itself
module.exports = _.extend({
	Either: Either
}, Either);
