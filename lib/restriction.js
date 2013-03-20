var
	_ = require('./curry.js'),
	util = require('util');

function CheckError(msg, constr) {
  Error.captureStackTrace(this, constr || this);
  this.message = msg || 'Failed check';
}
util.inherits(CheckError, Error);
CheckError.prototype.name = 'Check Error';

function RestrictionError(msg, constr) {
  Error.captureStackTrace(this, constr || this);
  this.message = msg || 'Failed restriction';
}
util.inherits(RestrictionError, CheckError);
RestrictionError.prototype.name = 'Restriction Error';

/**
 * check is a unary function on an array
 * check :: xs -> Bool
 */
function Restriction(check, transform) {
	this.check = check;
	this.transform = transform || _.identity;
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

/**
 * returns a Restriction that applies func to the arguments
 * at the given positions
 */
function restriction(func, positions, msg) {
	msg = msg || 'Restriction failed';

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


function ArgumentRestriction(func, positions, msg) {
	if (!(positions instanceof Array)) positions = [positions];

	this.f = func;
	this.pos = positions;
	this.msg = msg;
	this.transform = _.identity;
}
util.inherits(ArgumentRestriction, Restriction);

ArgumentRestriction.prototype.check = function(args) {
	var to_check = _.map(this.pos, function(i) {
		return args[i]
	});

	if (! this.f.apply(void 0, to_check)) {
		return this.msg;
	}
};

function ValueRestriction(func, msg, transform) {
	this.f = func;
	this.msg = msg;
	this.transform = transform || _.identity;
}
util.inherits(ValueRestriction, Restriction);

_.extend(ValueRestriction.prototype, {
	check: function(ret) {
		if (! this.f(ret)) {
			return this.msg;
		}
	},

	at: function(positions) {
		var that = this;

		return new ArgumentRestriction(function() {
			return _.every(arguments, that.f);
		}, positions, this.msg);
	},

	many: function(msg) {
		var that = this;
		return new ValueRestriction(
			_.partial(_.forall, this.f),
			msg || this.msg,
			_.partial(_.fmap, this.transform)
		);
	}
});

function valueRestriction(f, msg) {
	return new ValueRestriction(f, msg);
}

var nonRestriction = new Restriction(_.inert, _.identity);

function manualCheck(bool, msg) {
	if (!bool) throw new CheckError(msg);
}

function restrict(rest_args, rest_return, f) {
	manualCheck(rest_args instanceof Restriction,
		'Argument 1 must be a Restriction');
	manualCheck(rest_args instanceof Restriction,
		'Argument 2 must be a Restriction');
	manualCheck(f instanceof Function, 'Argument 3 must be a Function');

	if (_.debugging()) {
		var g = function() {
			var x, ret_err,
				arg_err = rest_args.check(arguments);

			if (arg_err) {
				throw new RestrictionError(arg_err);
			} else {
				x = f.apply(this, rest_args.transform(arguments));
				ret_err = rest_return.check(x);

				if (ret_err) {
					throw new RestrictionError(ret_err);
				} else {
					return rest_return.transform(x);
				}
			}
		}

		// record the circumstances of the restriction
		// especially useful for the typedFunction restriction
		g._stack_at_restrict = (new Error()).stack;

		return g;
	} else {
		return f;
	}
}

function restrictArgs(rest, f) {
	manualCheck(rest instanceof Restriction,
		'Argument 1 must be a Restriction');
	manualCheck(f instanceof Function, 'Argument 2 must be a Function');

	return restrict(rest, nonRestriction, f);
}

function restrictReturn(rest, f) {
	manualCheck(rest instanceof ValueRestriction,
		'Argument 1 must be a ValueRestriction');
	manualCheck(f instanceof Function, 'Argument 2 must be a Function');

	return restrict(nonRestriction, rest, f);
}

function isInstanceF(type) {
	return function(x) {
		return x instanceof type;
	}
}

function isTypeF(type) {
	return function(x) {
		return typeof x === type;
	}
}

function isInstance(constr, msg) {
	return valueRestriction(
		isInstanceF(constr),
		msg || ('Must be of type ' + constr)
	);
}

function isType(type, msg) {
	return valueRestriction(
		isTypeF(type),
		msg || ('Must be of type ' + type)
	);
}


var toMany = _.partial(_.compose, _.method('many'));
var isArrayOf = toMany(isInstance);
var isArrayOfType = toMany(isType);

function isArrayOfType(type, msg) {
	return valueRestriction(function(xs) {
		return xs instanceof Array && _.every(xs, isTypeF(type));
	}, msg || ('Must be an array of type ' + type));
}

function isDefined(msg) {
	return valueRestriction(function(x) { 
		return x !== void 0;
	}, msg || 'Must not be undefined');
}

function toArgRestrictionFunc(rF) {
	return function(positions, msg) {
		return rF(msg).at(positions);
	};
}

function descPositions(pos) {
	if (pos.length > 1) {
		return 'Arguments ' + pos;
	} else {
		return 'Argument ' + pos;
	}
}

var isFunction = _.curry(isInstance, Function);
var isDefinedAt = toArgRestrictionFunc(isDefined);
var isFunctionAt = toArgRestrictionFunc(isFunction);
var isInstanceAt = function(constr, positions, msg) {
	msg = msg || descPositions(positions) + ' must be of type ' + constr;

	return isInstance(constr, msg).at(positions);
}
var isTypeAt = function(type, positions, msg) {
	msg = msg || descPositions(positions) + ' must be of type ' + type;

	return isType(type, msg).at(positions);
}

// a restriction that does no checking, only transforms
function transforms(transform) {
	return new Restriction(_.constant(null), transform);
}


// checks that the arguments at positions are functions,
// and restricts them with rest
function typedFunction(rest, positions, msg) {
	manualCheck(rest instanceof Restriction,
		'Argument 1 must be a Restriction');

	msg = msg || 'Restriction failed';
	if (!(positions instanceof Array)) positions = [positions];

	return isFunctionAt(positions, msg).and(transforms(
		function(args) {
			var new_args = [], i, len;

			// safe for arguments object or array
			for (i = 0, len = args.length; i < len; i++) {
				new_args[i] = args[i];
			}

			_.each(positions, function(i) {
				new_args[i] = restrictArgs(rest, args[i]);
			});

			return new_args;
		}
	));
}


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
function hasArity(n) {
	return _.curry(arity, n);
}

module.exports = {
	Restriction: Restriction,
	ArgumentRestriction: ArgumentRestriction,
	RestrictionError: RestrictionError,
	CheckError: CheckError,
	restrict: restrict,
	restriction: restriction,
	restrictArgs: restrictArgs,
	restrictReturn: restrictReturn,
	manualCheck: manualCheck,
	transforms: transforms,

	isInstance: isInstance,
	isType: isType,
	isFunction: isFunction,
	isDefined: isDefined,

	isInstanceAt: isInstanceAt,
	isFunctionAt: isFunctionAt,
	isDefinedAt: isDefinedAt,
	isTypeAt: isTypeAt,

	isArrayOf: isArrayOf,
	isArrayOfType: isArrayOfType,

	typedFunction: typedFunction,
	hasArity: hasArity,
	arity: arity
};

