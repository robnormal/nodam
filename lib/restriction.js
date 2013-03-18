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
function Restriction(check, transform) {
	this.check = check;
	this.transform = transform || _.identity;
}

/**
 * returns a Restriction that applies func to the arguments
 * at the given positions
 */
function restriction(func, positions, msg) {
	msg = msg || 'Restriction failed';
	if (!(positions instanceof Array)) positions = [positions];

	var stack = (new Error()).stack;

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

	// }, _.compose(this.transform, rest.transform));
	}, function(args) {
		return that.transform(rest.transform(args));
	});
}

function restrict(rest, f) {
	if (_.debugging()) {
		return function() {
			var err = rest.check(arguments);

			if (err) {
				throw new RestrictionError(err);
			} else {
				return f.apply(this, rest.transform(arguments));
			}
		}
	} else {
		return f;
	}
}

function forAll(f) {
	return _.curry(restriction, (function() {
		return _.every(arguments, f);
	}));
}

function isType(type, positions, msg) {
	return forAll(function(x) {
		return x instanceof type;
	})(positions, msg);
}

var isFunction = _.curry(isType, Function);
var isDefined = forAll(function(x) {
	return x !== void 0;
});

// a restriction that does no checking, only transforms
var transforms = function(transform) {
	return new Restriction(_.constant(null), transform);
}

function isInstanceof(constructor) {
	return function(x) {
		return x instanceof constructor;
	};
}

function arrayOf(constructor) {
	return function(xs) {
		return _.isArray(xs) && _.all(xs, isInstanceof(constructor));
	};
}


// checks that the arguments at positions are functions,
// and restricts them with rest
var typedFunction = function(rest, positions, msg) {
	msg = msg || 'Restriction failed';
	if (!(positions instanceof Array)) positions = [positions];

	if (! (rest instanceof Restriction)) {
		throw new Error();
	}

	return isFunction(positions, msg).and(transforms(
		function(args) {
			var new_args = [], i, len;

			// safe for arguments object or array
			for (i = 0, len = args.length; i < len; i++) {
				new_args[i] = args[i];
			}

			// console.log(args[1], args[1].toString && args[1].toString());
			_.each(positions, function(i) {
				new_args[i] = restrict(rest, args[i]);
			});

			return new_args;
		}
	));
};


/**
 * returns an equivalent function that throws an error if 
 * it fails to receive exactly n arguments
 */
function arity(n, f) {
	if (! _.debugging()) return f;

	if (undefined !== f.arity) {
		if (f.arity !== n) {
			throw new RestrictionError(
				'Cannot assign arity ' + n +
				' to function that already has arity ' + f.arity
			);
		} else {
			return f;
		}
	} else {
		var ff = function() {
			if (arguments.length !== n) {
				throw new RestrictionError('Expected ' + n + ' arguments, got ' + arguments.length);
			} else {
				return f.apply(void 0, arguments);
			}
		};

		ff.arity = n;

		return ff;
	}
}

// var hasArity = _.curry(_.curry, arity);
var hasArity = function(n) {
	return _.curry(arity, n);
}

module.exports = {
	Restriction: Restriction,
	RestrictionError: RestrictionError,
	restriction: restriction,
	restrict: restrict,

	transforms: transforms,
	isType: isType,
	isFunction: isFunction,
	isDefined: isDefined,
	typedFunction: typedFunction,
	hasArity: hasArity,
	arity: arity
};

