/*jshint node: true */

var _ = require('../lib/curry.js');
var mb = require('../lib/Maybe.js');
var M = require('../lib/nodam.js');
var E = require('../lib/Either.js');
var R = require('../lib/restriction.js');

		M.debug(true);
var mfs = M.fs();
var fs = require('fs');

function doesntThrow(assert, f, err) {
	try {
		f();
	} catch (e) {
		assert.doesNotThrow(function () {
			throw e;
		}, err, e.toString());
	}
}

function replaceListenersOnce(evName, listener) {
	var ls = process.listeners(evName);
	process.removeAllListeners(evName);

	process.once(evName, function(ev) {
		listener(ev);
		_.each(ls, function(l) { process.on(evName, l) });
	});
}

function getTime() {
	return (new Date()).getTime();
}

// for testing generic Monad functionality
function WriterMonad(x) {
	this.x = x;
}
_.extend(WriterMonad.prototype, M.Monad, {
	doBind: function(f) {
		var m = f(this.x[0]);
		return new WriterMonad([ m.x[0], this.x[1] + m.x[1] ]);
	},
	unwrap: function() {
		return this.x;
	}
});

WriterMonad.result = function(x) {
	return new WriterMonad([x, '']);
};

var path1 = __dirname + '/fixtures/monadTest.txt';
var path2 = __dirname + '/fixtures/monadTest2.txt';
var path3 = __dirname + '/fixtures/monadTest3.txt';

function monadErr(assert, msg) {
	return function(err) {
		// assert.ok(false, msg || ('Monad error: ' + err));
    throw err;
	};
}

module.exports = {
	'Monads can pipe, etc.': function(beforeExit, assert) {
		var w = new WriterMonad([3, 'I am three']);

		var output = w.pipe(function(x) {
			return new WriterMonad([4 * x, ', but I can multiply by 4']);
		}).unwrap();

		assert.equal(output[0], 12);
		assert.equal(output[1], 'I am three, but I can multiply by 4');

		output = w.pipe(WriterMonad.result);
		assert.deepEqual(output.unwrap(), w.unwrap(), 'Piping "result" should do nothing');
	},

	'Monads are immutable wrt pipe(), etc.': function(b, assert) {
		var w = new WriterMonad([3, 'I am three']);

		var output = w.pipe(function(x) {
			return new WriterMonad([4 * x, ', but I can multiply by 4']);
		}).unwrap();

		assert.equal(w.unwrap()[0], 3);
	},

	'mmap() is equivalent to (result . pipe)': function(b, assert) {
		var w = new WriterMonad([3, 'I am three']);

		var output = w.mmap(function(x) { return 2*x; }).unwrap();
		assert.equal(output[0], 6);
		assert.equal(output[1], 'I am three');
	},

	'm.pipe(f) throws an error if f does not return a monad of the proper type': function(b, assert) {
		var w = new WriterMonad([3, 'I am three']);

		assert.throws(function() {
			w.pipe(_.identity);
		});

		doesntThrow(assert, function() {
			w.pipe(_.constant(w));
		});
	},

	'm.pipeArray(f) passes multiple arguments to f instead of an array': function(b, assert) {
		var w = new WriterMonad([ ['this', 'is', 1, []],  'I have four elements in my array']);

		var ww = w.pipeArray(function(str1, str2, int, arr) {
			return WriterMonad.result(str1 + str2 + int);
		});

		assert.equal(ww.unwrap()[0], 'thisis1');
	},

	'lift() turns a non-monadic function into a monadic one': function(beforeExit, assert) {
		// join array of lines into string
		var unlines = _.method('join', ["\n"]);
		var unlinesM = M.liftM(unlines);

		var reads = M.combine([
			M.fs().readFile(path1, 'ascii'),
			M.fs().readFile(path2, 'ascii')
		]).pipe(function(files) {
			return M.result(files);
		});

		var text1, text2;

		var joinRead1 =	reads .pipe(
			function(lines) {
				text1 = lines;
				return M.result(unlines(lines));
			}
		) .pipe(
			function(x) {
				return M.result(x);
			}
		);

		var joinRead2 =	unlinesM(reads) .pipe(
			function(x) {
				return M.result(x);
			}
		);

		joinRead1.run(function(s) {
			text1 = s;
		}, function(e) {
			console.log(e);
		});

		joinRead2.run(function(s) {
			text2 = s;
		}, function(e) {
			console.log(e);
		});

		beforeExit(function() {
			assert.ok(text1);
			assert.ok(text2);
			assert.equal(text1, text2);
		});
	},

	'sequence_ combines a list of monads with then()': function(beforeExit, assert) {
		var a,b,c, ma, mb, mc, m;

		ma = M.result(1).mmap(function(n) { a = n; });
		mb = M.result(2).mmap(function(n) { b = n; });
		mc = M.result(3).mmap(function(n) { c = n; });

		M.sequence_([ma, mb, mc]).run(_.inert, function(err) {
			throw new Error('Monad error: ' + err);
		});

    beforeExit(function() {
      assert.equal(a, 1);
      assert.equal(b, 2);
      assert.equal(c, 3);
    });
	},

	'sequence is like sequence_, but returns the values of the monads': function(b, assert) {
		var ma, mb, mc, m;

		ma = M.result(1);
		mb = M.result(2);
		mc = M.result(3);

		M.sequence([ma, mb, mc]).mmap(function(xs) {
			assert.equal(xs[0], 1);
			assert.equal(xs[1], 2);
			assert.equal(xs[2], 3);
		}).run(_.inert, function(err) {
			throw new Error('Monad error: ' + err);
		});
	},

	'pipeline composes a list of pipeable functions into one pipeable function': function(b, assert) {
		var
			a = function(x) {
				return M.result(x*2);
			},
			b = function(x) {
				return M.result(x + 1);
			},
			c = function(x) {
				return M.result(x.toString() + ' little Indians');
			};

		M.result(3).pipe(M.pipeline([a,b,c]))
			.run(function(text) {
				assert.equal(text, '7 little Indians');
			}, function(err) {
				throw err;
			});
	},

	'Maybe is a Monad': function(b, assert) {
		assert.ok(mb.Maybe.prototype.pipe && mb.Maybe.result, 'Maybe has Monad methods');

		doesntThrow(function() {
			_.nothing.pipe(function(x) {
				throw new Error('should not happen');
			});
		}, Error, 'piping to "nothing" should do nothing');

		var x = mb.just(4).pipe(function(y) { return mb.just(2 * y); });

		assert.ok(x.isJust());
		assert.equal(x.fromJust(), 8);
	},

	'AsyncMonad serializes functions': function(beforeExit, assert) {
		var count = 0;

		var a = function(mstuff) {
			mstuff.success(E.right(100), mstuff.state);
		};

		var async;
		doesntThrow(assert, function() {
			async = new M.AsyncMonad(a);
			async.run(function(u, s) {
				assert.equal(u, 100);
				assert.equal(s && s.joe, 'blow');
			}, _.identity, {joe: 'blow'});
		});

		var b = async.pipe(function(x) {
			count++;

			return M.AsyncMonad.result(x * 10);
		});

		b.run(function(out) {
			count++;

			assert.equal(out, 1000, 'pipe() works');
		}, _.identity);

		beforeExit(function() {
			assert.equal(count, 2);
		});
	},

	'readFile monadically reads files': function(beforeExit, assert) {
		// counter to ensure our callbacks get called
		var count = 0;

		mfs.readFile(path1, 'ascii') .pipe_(function(x) {
			var y = require('fs').readFileSync(path1, 'ascii');
			assert.equal(x, y);

			count++;

			return M.AsyncMonad.result(x.length);
		}).pipe(function(len) {
			var y = require('fs').readFileSync(path1, 'ascii');
			assert.equal(len, y.length);

			count++;

			return M.AsyncMonad.result(null);
		}).run(_.identity, _.identity);

		beforeExit(function() {
			assert.equal(count, 2);
		});
	},

	'readFile passes errors to "failure" callback': function(beforeExit, assert) {
		var path = __dirname + '/fixtures/NON-EXISTENT';

		var count = 0;
		var bad_count = 0;

		function myErr(err) {
			count++;
		}

		// should send error to myErr...
		mfs.readFile(path, 'ascii').run(_.identity, myErr);

		// even if it's piped first
		mfs.readFile(path, 'ascii') .pipe(function(x) {
			// this should not run
			bad_count++;

			return M.AsyncMonad.result(x.length);
		}).run(_.identity, myErr);

		beforeExit(function() {
			assert.equal(count, 2);
			assert.equal(bad_count, 0);
		});
	},


	'AsyncMonad is associative': function(beforeExit, assert) {
		var
			path1 = __dirname + '/fixtures/monadTest.txt',
			path2 = __dirname + '/fixtures/monadTest2.txt',
			path3 = __dirname + '/fixtures/monadTest3.txt',
			text1 = fs.readFileSync(path1, 'ascii'),
			text2 = fs.readFileSync(path2, 'ascii'),
			count = 0,
			lines = function(str) {
				return str.split("\n");
			},
			numberLines = function(str) {
				return lines(str).map(function(s, index) {
					return index + ': ' + s;
				});
			},
			f2 = function(text2) {
				// add line numbers to text2 and append text3
				return mfs.readFile(path3) .mmap(function(text3) {
					return numberLines(text2) + "\n" + text3;
				});
			},
			getMonad2 = function(str) {
				// repeat next text as many times as there are characters
				// in this text
				var repeat_text = _.curry(_.repeat, str.length);
				return mfs.readFile(path2).mmap(repeat_text).mmap(_.method('join'));
			},
			m1, m2
		;


		// build the monad two different ways
		m1 = mfs.readFile(path1, 'ascii') .pipe(function(text) {
			return getMonad2(text) .pipe(f2);
		});

		m2 = mfs.readFile(path1, 'ascii') .pipe(function(text) {
			return getMonad2(text);
		}) .pipe(f2);


		// capture outputs, then check them in the beforeExit callback
		var output1, output2;
		m1.run(function(str) {
			output1 = str;
		});
		m2.run(function(str) {
			output2 = str;
		});

		beforeExit(function() {
			assert.equal(output1, output2);
		});
	},

	'AsyncMonad fails with a CheckError if you pipe the wrong type, but only when it runs': function(b, assert) {
		var m1 = mfs.readFile(path1, 'ascii') .pipe(function(text) {
			return mb.just(text);
		});

		var err_thrown = false, err_passed = false;
		// Can't catch the error here, so 
		replaceListenersOnce('uncaughtException', function (err) {
			assert.ok(err instanceof R.CheckError);
			err_thrown = true;
		});

		m1.run(_.inert, function() {
			err_passed = true;
		});

		b(function() {
			assert.ok(err_thrown, 'throws exception');
			assert.ok(! err_passed, 'dose not pass exceptions as failures');
		});
	},

	'piping from an AsyncFailure has no effect': function(beforeExit, assert) {
		var fail = new M.AsyncFailure('No good');

		var fail_callback_ran = false;

		fail.pipe(function(x) {
			assert.fail('pipe after AsyncFailure does not run');

			return M.result();
		}).run(_.inert, _.inert, {});

		M.result(6).pipe(function(x) {
			return mfs.readFile(path1).pipe(function(text) {
				return new M.AsyncFailure(42);
			});
		}).pipe(function(x) {
			assert.fail('pipe after pipe that returned AsyncFailure does not run');
			return M.result();
		}).pipe(function() {
			assert.fail('pipe after pipe that returned AsyncFailure does not run - part 2');
			return M.result();
		}).run(function() {
			assert.fail('success callback does not run for AsyncFailure');
		}, function(err) {
			fail_callback_ran = true;
			assert.equal(err, 42, 'passes its enclosed value to failure callback');
		});

		beforeExit(function() {
			assert.ok(fail_callback_ran);
		});
	},

	'rescue() catches errors': function(beforeExit, assert) {
		var
			bad_path = __dirname + '/fixtures/NON-EXISTENT',
			got_rescued = false,
			succeeded = false,
			ran_err = false,
			piped_after = false,
			got_rescued_2 = false,
			succeeded_2 = false,
			ran_err_2 = false;

		// should rescue error...
		mfs.readFile(bad_path, 'ascii')
			.rescue(function(err) {
				got_rescued = true;
				return M.result(5);
			})
			.run(function(arg, s) {
				succeeded = true;
				assert.equal(arg, 5, 'Passed result from rescue()');
			}, function myErr(err) {
				ran_err = true;
			});

		// even if it's piped first
		mfs.readFile(bad_path, 'ascii')
			.pipe(function(x) {
				// this should not run
				piped_after = true;

				return M.AsyncMonad.result(x.length);
			})
			.rescue(function(err) {
				got_rescued_2 = true;
				return M.result(9);
			})
			.run(function(x) {
				succeeded_2 = true;
			}, function(err) {
				ran_err_2 = true;
			});


		var
			piped_after_3 = false,
			ran_err_3 = false;

		// can return another failure
		mfs.readFile(bad_path, 'ascii')
			.rescue(function(err) {
				return new M.AsyncFailure('another err');
			})
			.pipe(function(x) {
				// this should not run
				piped_after_3 = true;

				return M.AsyncMonad.result(x.length);
			})
			.run(function(arg, s) {
				assert.fail('rescue can fail, too');
			}, function myErr(err) {
				ran_err_3 = true;
			});

		beforeExit(function() {
			assert.ok(got_rescued, 'error caught');
			assert.ok(succeeded, 'success callback run after error');
			assert.ok(! ran_err, 'final error callback not run');

			assert.ok(! piped_after, 'pipe skipped after error');
			assert.ok(got_rescued_2, 'error caught after pipe');
			assert.ok(succeeded_2, 'success callback run after error and pipe');
			assert.ok(! ran_err_2, 'final error callback not run after pipe');

			assert.ok(! piped_after_3, 'if rescue returns failure, it skips piped functions');
			assert.ok(ran_err_3, 'failure returned from rescue is eventually passed to failure callback');
		});
	},

	'get() retrieves state information': function(beforeExit, assert) {
		var
			piped_after = false,
			succeeded = false
			;

		M.get('joe').pipe(function(joe) {
				piped_after = true;
				assert.equal(joe, 'blow', 'get() retrieved the right value');

				return M.result(joe + 's the wind');
			})
			.run(function(result) {
				succeeded = true;
				assert.equal(result, 'blows the wind');
			}, _.inert, { joe: 'blow' });


		beforeExit(function() {
			assert.ok(piped_after, 'pipe after get worked');
			assert.ok(succeeded, 'success callback run after get');
		});
	},

	'set() sets state information': function(beforeExit, assert) {
		var
			piped_after = false,
			succeeded = false
			;

		M.get('joe')
			.pipe(function(joe) {
				assert.equal(joe, 'blow', 'state unaffected before set');
				return M.result(joe);
			})
			.set('joe', 'mama').pipe(function(joe) {
				piped_after = true;
				// assert.equal(joe, 'mama', 'get() retrieved the right value');

				return M.result(joe + ' loves me');
			})
			.run(function(result) {
				succeeded = true;
				assert.equal(result, 'mama loves me');
			}, _.inert, { joe: 'blow' });

		M.get('joe')
			.pipe(function(joe) {
				assert.equal(joe, 'blow', 'state unaffected before set');
				return M.result(joe);
			})
			.set('joe', 'mama').pipe(function(joe) {
				piped_after = true;
				// assert.equal(joe, 'mama', 'get() retrieved the right value');

				return M.result(joe + ' loves me');
			})
			.run(function(result) {
				succeeded = true;
				assert.equal(result, 'mama loves me');
			}, _.inert, { joe: 'blow' });


		// set between each step
		M.set('alice', 'bob')
			.then(M.result(234))
			.pipe(function(n) {
				return M.set('foo', 'bar')
					.then(M.result(5*n))
					.set('say', 'cheese');
			})
			.run(function(u, s) {
				assert.ok(s);
				if (s) {
					assert.equal(s.alice, 'bob');
					assert.equal(s.foo, 'bar');
					assert.equal(s.say, 'cheese');
				}
			}, function(err) {
				assert.fail(err);
			}, {});

		beforeExit(function() {
			assert.ok(piped_after, 'pipe after set worked');
			assert.ok(succeeded, 'success callback run after get');
		});
	},

	'combine() runs multiple async requests in parallel': function(beforeExit, assert) {
		var
			text1 = fs.readFileSync(path1, 'ascii'),
			text2 = fs.readFileSync(path2, 'ascii'),

			count = 0,
			m1 = mfs.readFile(path1, 'ascii'),
			m2 = mfs.readFile(path2, 'ascii');

		var m = M.AsyncMonad .combine([m1, m2]);

		var func = function(e_file1, e_file2) {
			var file1 = e_file1.fromRight();
			var file2 = e_file2.fromRight();

			assert.equal(file1, text1);
			assert.equal(file2, text2);

			count++;
			return M.AsyncMonad.result(file1.length + file2.length);
		};
		func.id = 'combine pipe';

		var mm = m .pipeArray( func);

		mm.run(function(x) {
			assert.equal(x, 55, 'Got both files, and measured their combined length');
			count++;
		}, function(err) {
			throw err;
		});

		beforeExit(function() {
			assert.equal(count, 2);
		});
	},

	'combine() passes an array of Eithers': function(beforeExit, assert) {
		var
			nonexistent = __dirname + '/fixtures/NON-EXISTENT',
			errAfterSkipsPipe = true,
			errWithin = false,
			errWithinSkipsPipe = true;

		var
			m1 = M.AsyncMonad.combine([
				mfs.readFile(path1, 'ascii'),
				mfs.readFile(nonexistent, 'ascii')
			])
			.pipeArray(function(e_file1, e_file2) {
				errAfterSkipsPipe = false;

				assert.ok(e_file1.isRight());
				assert.ok(e_file2.isLeft());

				return M.result(5);
			})
		;

		var
			m2 = M.AsyncMonad.combine([
				mfs.readFile(path1, 'ascii'),
				mfs.readFile(nonexistent, 'ascii')
					.rescue(function (err) {
						errWithin = true;
						return M.result(5);
					})
			])
			.pipeArray(function(e_1, e_2) {
				assert.ok(e_1.isRight());
				assert.ok(e_2.isRight());
				assert.equal(e_2.fromRight(), 5);

				return M.result(5);
			})
		;

		m1.run(_.inert, _.inert, {});
		m2.run(_.inert, _.inert, {});

		beforeExit(function() {
			assert.ok(! errAfterSkipsPipe, 'piped function is not skipped');
			assert.ok(errWithin, 'rescue inside combine works');
		});
	},

	'combine() preserves state': function(beforeExit, assert) {
		var
			text1 = fs.readFileSync(path1, 'ascii'),
			text2 = fs.readFileSync(path2, 'ascii'),

			count = 0,
			m1 = mfs.readFile(path1, 'ascii'),
			m2 = mfs.readFile(path2, 'ascii'),
			m = M.AsyncMonad .combine([m1, m2]);

		m.run(function(x, state) {
			assert.equal(state && state.foo, 'bar');
			count++;
		}, monadErr(assert), { foo: 'bar' } );

		beforeExit(function() {
			assert.equal(count, 1);
		});
	},

	'no way I know of to test forever() or loop()': function(beforeExit, assert) {
		/*
		var m = M.result(0).pipe(function(x) {
			return M.result(x + 1);
		});

		m.forever().run(_.inert, _.inert);
		*/
	},

	'loopWhile() loops function until the condition is false wrt the last result of the function': function(beforeExit, assert) {
		var m = M.result('abc')
			.loopWhile(
				function(x) { return x.length < 100 },
				function(x) {
					return M.result(x + x);
				}
			);

		m.run(function(x) {
			assert.ok(x.length >= 100);
		});
	},

	'When debugging, bad function calls generate helpful error information': function(beforeExit, assert) {
		M.debug(true);
		var
			first_err_ran = false,
			second_err_ran = false,
			pipe_ran = false;

		try {
			// should send error to myErr...
			mfs.readFile({ not_a: 'string' }).run(_.inert, _.inert);
		} catch(err) {
			first_err_ran = true;

			assert.ok(err.monad);
			if (err.monad) {
				assert.ok(err.monad.arguments);
				assert.equal(err.monad.library, 'fs');
				assert.equal(err.monad.callback, 'readFile');
			}
		}

		try {
			// even if it's piped first
			mfs.readFile({ not_a: 'string' }, 'ascii') .pipe(function(x) {
				// this should not run
				pipe_ran = true;

				return M.AsyncMonad.result(x.length);
			}).run(_.inert, _.inert);
		} catch(err) {
			second_err_ran = true;

			assert.ok(err.monad);
			if (err.monad) {
				assert.ok(err.monad.arguments);
				assert.equal(err.monad.library, 'fs');
				assert.equal(err.monad.callback, 'readFile');
			}
		}

		beforeExit(function() {
			assert.ok(first_err_ran);
			assert.ok(! pipe_ran);
			assert.ok(second_err_ran);
		});

	},

	'setFor sets a value only within the passed monad': function(beforeExit, assert) {
		var
			checkMe = function(val, msg) {
				return M.get('me').pipe(function(me) {
					assert.equal(me, val, msg);

					return M.result('checked');
				});
			},
			monad = M,
			state = {me: 'you'},
			m1 = checkMe('you'),
			m2 = m1 .then(
				M.setFor('me', 'bob',
					checkMe('bob', 'sets the value inside the piped monad') .then(
						checkMe('bob', 'sets the value inside sub-piped monads')
					)
				) .then(checkMe('you', 'does not affect actions outside passed monad'))
			);

		m1.run(_.inert, monadErr(assert), state);
		m2.run(_.inert, monadErr(assert), state);
	},

	'pipeMaybe': function(b, assert) {
	}
};

