var _ = require('./curry.js');

// use this to prevent users from calling Maybe,
// while still making it available for use with instanceof
var semaphore = {};
function Maybe(x, is_just, flag) {
	is_just = !!is_just;

	if (flag !== semaphore) {
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
		return this.isNothing() ? 'Nothing' : 'Just(' + this.fromJust() + ')';
	}
};

function just(x) {
	return new Maybe(x, true, semaphore);
}

var nothing = new Maybe(null, false, semaphore);

function toMaybe(x) {
	return void 0 === x || null === x ?
		nothing : just(x);
}

module.exports = {
	Maybe: Maybe,
	nothing: nothing,
	just: just,
	toMaybe: toMaybe
};

