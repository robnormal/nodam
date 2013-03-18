var _ = require('./curry.js');

function RestrictionError(msg, constr) {
  Error.captureStackTrace(this, constr || this)
  this.message = msg || 'Failed restriction'
}
require('util').inherits(RestrictionError, Error);

RestrictionError.prototype.name = 'Restriction Error';

/**
 * check is a unary function on an array
 * check :: xs -> Bool
 */
function Restriction(check) {
	this.check = check;
}

/**
 * returns a Restriction that applies func to the arguments
 * at the given positions
 */
function restriction(func, positions, msg) {
	msg = msg || 'Restriction failed';

	return new Restriction(function(args) {
		var to_check = _.map(positions, function(i) {
			return args[i]
		});

		if (! func.apply(void 0, to_check)) {
			return msg;
		}
	});
}

Restriction.prototype.and = function(rest) {
	var that = this;
	return new Restriction(function(args) {
		// return the first string returned
		return that.check(args) || rest.check(args);
	});
}

function restrict(rest, f) {
	if (_.debugging()) {
		return function() {
			var err = rest.check(arguments);

			if (err) {
				throw new RestrictionError(err);
			} else {
				return f.apply(this, arguments);
			}
		}
	} else {
		return f;
	}
}


module.exports = {
	Restriction: Restriction,
	RestrictionError: RestrictionError,
	restriction: restriction,
	restrict: restrict
};

