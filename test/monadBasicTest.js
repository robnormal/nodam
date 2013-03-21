/*jshint node: true */

var _ = require('../lib/curry.js');
var mb = require('../lib/Maybe.js');
var M = require('../lib/nodam-basic.js');

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


	'AsyncMonad serializes functions': function(beforeExit, assert) {
		var count = 0;

		var a = function(mstuff) {
			mstuff.success(mb.right(100), mstuff.state);
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

		mfs.readFile(path1, 'ascii') .pipe(function(x) {
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

		beforeExit(function() {
			assert.ok(got_rescued, 'error caught');
			assert.ok(succeeded, 'success callback run after error');
			assert.ok(! ran_err, 'final error callback not run');

			assert.ok(! piped_after, 'pipe skipped after error');
			assert.ok(got_rescued_2, 'error caught after pipe');
			assert.ok(succeeded_2, 'success callback run after error and pipe');
			assert.ok(! ran_err_2, 'final error callback not run after pipe');
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

	'combine() passes': function(beforeExit, assert) {
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
	}

};

