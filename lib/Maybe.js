/*jshint node: true */
var
  _ = require('./curry.js'),
  nothing;

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

function just(x) {
  return new Maybe(x, true, semaphoreA);
}

_.extend(Maybe, {
  isJust: function(m) {
    return m.isJust();
  },
  fromJust: function(m) {
    return m.isJust();
  },

  isNothing: function(m) {
    return ! m.isJust();
  },
  fmap: function(m, f) {
    if (m.isNothing()) {
      return m;
    } else {
      return just(f(m.fromJust()));
    }
  },
  or: function(m, x) {
    if (m.isNothing()) {
      return x;
    } else {
      return m.fromJust();
    }
  },
  toString: function(m) {
    return m.isNothing() ? 'Maybe::Nothing' : 'Maybe::Just(' + m.fromJust() + ')';
  },
  concat: function(xs) {
    return _.reduce(xs, function(memo, x) {
      if (x.isJust()) memo.push(x.fromJust());

      return memo;
    }, []);
  }
});

_.extend(Maybe.prototype, {
  isNothing: function() { return Maybe.isNothing(this) },
  fmap: function(f) { return Maybe.fmap(this, f) },
  or: function(x) { return Maybe.or(this, x) },
  toString: function() { return Maybe.toString(this) },
});

nothing = new Maybe(null, false, semaphoreA);



function toMaybe(x) {
  return void 0 === x || null === x ?
    nothing : just(x);
}

module.exports = {
  Maybe: Maybe,
  isJust: Maybe.isJust,
  fromJust: Maybe.fromJust,
  isNothing: Maybe.isNothing,
  fmap: Maybe.fmap,
  or: Maybe.or,
  toString: Maybe.toString,
  nothing: nothing,
  just: just,
  toMaybe: toMaybe
};
