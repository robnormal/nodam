/*jshint node: true */

var _ = require('../lib/curry.js');
var mb = require('../lib/Maybe.js');
var M = require('../lib/AsyncMonad.js');

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

module.exports = {
	/*
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

		var a = function(yes, no) {
			yes(100);
		};

		var async;
		doesntThrow(assert, function() {
			async = new M.AsyncMonad(a);
			async.run(_.identity, _.identity);
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

	'onErr overrides failure callback': function(beforeExit, assert) {
		var 
			nonexistent = __dirname + '/fixtures/NON-EXISTENT',
			count = 0,
			bad_count = 0,
			good_count = 0,
			override_count = 0;

		function wrongErr(err) {
			count++;
		}

		function overrideErr(err) {
			override_count++;
		}

		// should send error to overrideErr...
		mfs.readFile(nonexistent, 'ascii')
			.onErr(overrideErr)
			.run(_.identity, wrongErr);

		// even if it's piped first...
		mfs.readFile(nonexistent, 'ascii') .pipe(function(x) {
			// this should not run
			bad_count++;

			return M.AsyncMonad.result(x.length);
		}).onErr(overrideErr).run(_.identity, wrongErr);

		// or afterward
		mfs.readFile(path1, 'ascii') .pipe(function(x) {
			// this SHOULD run
			good_count++;

			return mfs.readFile(nonexistent, 'ascii');
		})  .onErr(overrideErr)   .pipe(function(x) {
			// this should not run
			bad_count++;

			return M.AsyncMonad.result(x.length);
		}).run(_.identity, wrongErr);


		beforeExit(function() {
			assert.equal(count, 0);
			assert.equal(bad_count, 0);
			assert.equal(good_count, 1);
			assert.equal(override_count, 3);
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

		var func = function(file1, file2) {
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

	'AsyncMonad catches errors arising in combine() actions': function(beforeExit, assert) {
		var
			nonexistent = __dirname + '/fixtures/NON-EXISTENT',
			override_count = 0,
			bad_count = 0;

		var 
			m = M.AsyncMonad.combine([
				mfs.readFile(path1, 'ascii'),
				mfs.readFile(nonexistent, 'ascii')
			])
			.onErr(function (err) {
				override_count++;
			})
			.pipe(function(texts) {
				bad_count++;
			})
		;

		m.run();

		beforeExit(function() {
			assert.equal(override_count, 1);
			assert.equal(bad_count, 0);
		});
	},

	'combine() throws an Error if it does not get an array': function(b, assert) {
		assert.throws(function(){
			M.AsyncMonad .combine(
				mfs.readFile('blah', 'ascii'),
				mfs.readFile('yada', 'ascii'));
		}, Error);
		doesntThrow(function(){
			M.AsyncMonad .combine([
				mfs.readFile('blah', 'ascii'),
				mfs.readFile('yada', 'ascii')
			]);
		}, Error, 'But not if you put your monads in an array');
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
				repeat_text = _.curry(_.repeat, str.length);
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

	'loop!': function(beforeExit, assert) {
		var time = function() {
			return getTime();
		};

		var a = mfs.readFile(__dirname + '/fixtures/monadTest.txt', 'ascii');

		// there are easier ways to do a timed loop, but...
		var started = time();
		var lastTimeCalled = 0;
		var totalTime = 100;

		// do for one second, every tenth of a second
		var b = a .pipe(function(text) {
			// return a message and the current time
			return M.AsyncMonad.result([
				'monadTest.txt is ' + text.length + ' characters long',
				time()
			]);
		}) .loopWhile(function(result) {
			if (result[1] < started + totalTime) {
				lastTimeCalled = time();
				return true;
			} else {
				return false;
			}
		}, 10);

		// this consumes a lot of CPU, reading a file 10
		// times in a second
		var timed_run_finished = false;
		b.run(function(result) {
			assert.ok(lastTimeCalled < started + totalTime, 'Stopped calling at proper time');
			assert.ok(time() >= started + totalTime, 'Stopped calling at proper time');

			var file = fs.readFileSync(__dirname + '/fixtures/monadTest.txt', 'ascii');
			assert.equal(result[0], 'monadTest.txt is ' + file.length + ' characters long');

			timed_run_finished = true;
		});

		var runs = 0;
		var recordRuns = function(x) {
			runs++;
			return M.AsyncMonad.result(x);
		};

		var pipe_continues = false;
		var d = a .pipe(recordRuns) .loop(5) .pipe(function(x) {
			pipe_continues = true;
			return M.AsyncMonad.result(x);
		});

		var finishes = false;
		d.run(function() {
			finishes = true;
		});

		beforeExit(function() {
			assert.ok(timed_run_finished, 'run() works after loop');
			assert.equal(runs, 5, 'loop(5) runs 5 times');
			assert.ok(pipe_continues, 'Pipe continues after loop');
			assert.ok(finishes, 'run() works after loop');
		});
	},

	'nodam.setTimeout, monadic timer': function(beforeExit, assert) {
		
		var time1, time2;
		var monad = M;

		monad
			.result(getTime())
			.pipe(function(t) {

				time1 = t;
				return M.result();

			}) .then( M.setTimeout(100)) .pipe(function() {

				return M.result(getTime());

			}) .run(function(t) {

				time2 = t;

			}, function(err) {
				throw new Error('Monad error: ' + err);
			});

		beforeExit(function() {
			assert.ok(time1 && time2, 'monadic action was run');

			// check against 99 ms instead of 100, because the internal
			// timer does not always line up precisely and there appears
			// to be a rounding error on some systems
			assert.ok(time2 >= time1 + 99, 'timeout worked');
		});
	},
*/

	'lift() turns a non-monadic function into a monadic one': function(beforeExit, assert) {
		// join array of lines into string
		var unlines = _.method('join', "\n");
		var unlinesM = M.liftM(unlines);

		var reads = M.combine([
			M.fs().readFile(path1, 'ascii'),
			M.fs().readFile(path2, 'ascii')
		]).pipe(function(files) {
			console.log('Got files');
			return M.result(files);
		});

		var text1, text2;
		var joinRead1 =	reads .pipe(
			function(lines) {
				console.log('running 1');
				text1 = lines;
				return M.result(unlines(lines));
			}
		) .pipe(
			function(x) {
				return M.result(x);
			}
		);

		console.log(_.describeFunction(joinRead1.x));

		joinRead1.run(function(s) {
			console.log(s);
			text1 = s;
		}, function(e) {
			console.log(e);
		});

		var joinRead2 =	unlinesM(reads) .pipe(
			function(x) {
				return M.result(x);
			}
		);

		joinRead2.run(function(s) {
			console.log('ran 2');
			text2 = s;
		}, function(e) {
			console.log(e);
		});

		beforeExit(function() {
			/*
			assert.ok(text1);
			assert.ok(text2);
			assert.equal(text1, text2);
			*/
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
	}
};

