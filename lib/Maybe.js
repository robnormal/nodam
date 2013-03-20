/*jshint node: true */
var _ = require('./curry.js');

// use this to prevent users from calling Maybe,
// while still making it available for use with instanceof
var semaphoreA = {};
function Maybe(x, is_just, flag) {
	is_just = !!is_just;

	if (flag !== semaphoreA) {
		throw new Error(
			'Do not call Maybe directly; use just() or nothing instead'
		);
	} else {

		this.isJust = function() {
			return is_just;
		};

		this.fromJust = function() {
			if (this.isNothing()) {
				throw new Error('Cannot call fromJust() on Nothing');
			} else {
				return x;
			}
		};
	}
}

Maybe.prototype = {
	isNothing: function() {
		return ! this.isJust();
	},
	fmap: function(f) {
		if (this.isNothing()) {
			return this;
		} else {
			return just(f(this.fromJust()));
		}
	},
	or: function(x) {
		if (this.isNothing()) {
			return x;
		} else {
			return this.fromJust();
		}
	},
	toString: function() {
		return this.isNothing() ? 'Maybe::Nothing' : 'Maybe::Just(' + this.fromJust() + ')';
	}
};

function just(x) {
	return new Maybe(x, true, semaphoreA);
}

var nothing = new Maybe(null, false, semaphoreA);

function toMaybe(x) {
	return void 0 === x || null === x ?
		nothing : just(x);
}


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

Either.prototype = {
	isRight: function() {
		return ! this.isLeft();
	},
	rightMap: function(f) {
		if (this.isLeft()) {
			return this;
		} else {
			return Either.right(f(this.fromRight()));
		}
	},
	leftMap: function(f) {
		if (this.isLeft()) {
			return Either.left( f(this.fromLeft()) );
		} else {
			return this;
		}
	},
	either: function(rf, lf) {
		if (this.isLeft()) {
			return lf(this.fromLeft());
		} else {
			return rf(this.fromRight());
		}
	}
};

Either.right = function(x) {
	return new Either(null, x, false, semaphoreB);
};

Either.left = function(err) {
	return new Either(err, null, true, semaphoreB);
};

function toEither(x, err) {
	return void 0 === x || null === x ?
		Either.left(err) : Either.right(x);
}

module.exports = {
	Maybe: Maybe,
	nothing: nothing,
	just: just,
	toMaybe: toMaybe,
	Either: Either,
	left: Either.left,
	right: Either.right
};

