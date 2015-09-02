var path = require('path'),
    fs = require('fs'),
    builder = require('xmlbuilder'),
    moment = require('moment');

var TRXReporter = function (baseReporterDecorator, config, emitter, logger, helper, formatError) {
    var outputFile = config.outputFile;
    var log = logger.create('reporter.trx');
    var hostName = require('os').hostname();
    var testRunDocument;
    var resultSummary;
    var counters;
    var testDefinitions;
    var testListIdNotInAList;
    var testEntries;
    var results;
    var suiteRunTimes;

    baseReporterDecorator(this);

    this.onRunStart = function () {
        var userName = process.env['USERNAME'];

        testRunDocument = builder.create("TestRun", {version: '1.0', encoding: 'UTF-8'})
            .att('id', newGuid())
            .att('name', userName + '@' + hostName + ' ' + getTimestamp())
            .att('runUser', userName)
            .att('xmlns', 'http://microsoft.com/schemas/VisualStudio/TeamTest/2010');

        testRunDocument.ele('TestSettings')
            .att('name', 'Karma Test Run')
            .att('id', newGuid());

        resultSummary = testRunDocument.ele('ResultSummary');
        counters = resultSummary.ele('Counters');
        testDefinitions = testRunDocument.ele('TestDefinitions');

        testListIdNotInAList = "8c84fa94-04c1-424b-9868-57a2d4851a1d";
        var testLists = testRunDocument.ele('TestLists');

        testLists.ele('TestList')
            .att('name', 'Results Not in a List')
            .att('id', testListIdNotInAList);

        // seems to be VS is expecting that exact id
        testLists.ele('TestList')
            .att('name', 'All Loaded Results')
            .att('id', "19431567-8539-422a-85d7-44ee4e166bda");

        testEntries = testRunDocument.ele('TestEntries');
        results = testRunDocument.ele('Results');

        suiteRunTimes = new SuiteRunTimes(testRunDocument);
    };

    this.onBrowserStart = function (browser) {
        suiteRunTimes.start = getTimestamp();
    };

    this.onBrowserComplete = function (browser) {
        var result = browser.lastResult;

        var passed = result.failed <= 0 && !result.error;
        resultSummary.att('outcome', passed ? 'Passed' : 'Failed');

        // todo: checkout if all theses numbers map well
        counters.att('total', result.total)
            .att('executed', result.total)
            .att('passed', result.total - result.failed)
            .att('error', result.error ? 1 : 0)
            .att('failed', result.failed);

        // possible useful info:
        // todo: result.disconnected => this seems to happen occasionally? => Possibly handle it!
        // (result.netTime || 0) / 1000)
    };

    this.onRunComplete = function () {
        var xmlToOutput = testRunDocument;

        suiteRunTimes.onRunComplete();

        helper.mkdirIfNotExists(path.dirname(outputFile), function () {
            fs.writeFile(outputFile, xmlToOutput.end({pretty: true}), function (err) {
                if (err) {
                    log.warn('Cannot write TRX testRun\n\t' + err.message);
                } else {
                    log.debug('TRX results written to "%s".', outputFile);
                }
            });
        });
    };

    this.specSuccess = this.specSkipped = this.specFailure = function (browser, result) {
        var unitTestId = newGuid(),
            unitTestName = browser.name + '_' + result.description,
            className = result.suite.join('.'),
            codeBase = className + '.' + unitTestName;

        var unitTest = testDefinitions.ele('UnitTest')
            .att('name', unitTestName)
            .att('id', unitTestId);

        var testOutcome = result.success ? 'Passed' : 'Failed';

        if (result.skipped) {
            testOutcome = 'NotExecuted';
        }

        var executionId = newGuid();

        unitTest.ele('Execution')
            .att('id', executionId);

        unitTest.ele('TestMethod')
            .att('codeBase', codeBase)
            .att('name', unitTestName)
            .att('className', className);

        testEntries.ele('TestEntry')
            .att('testId', unitTestId)
            .att('executionId', executionId)
            .att('testListId', testListIdNotInAList);

        var unitTestResult = results.ele('UnitTestResult')
            .att('executionId', executionId)
            .att('testId', unitTestId)
            .att('testName', unitTestName)
            .att('computerName', hostName)
            .att('duration', moment.utc(result.time || 0).format('HH:mm:ss.SSS'))
            .att('startTime', getTimestamp())
            .att('endTime', getTimestamp())
            // todo: are there other test types?
            .att('testType', '13cdc9d9-ddb5-4fa4-a97d-d965ccfc6d4b') // that guid seems to represent 'unit test'
            .att('outcome', testOutcome)
            .att('testListId', testListIdNotInAList);

        if (!result.success) {
            unitTestResult.ele('Output')
                .ele('ErrorInfo')
                .ele('Message', formatError(result.log[0]))
        }
    };
};

function SuiteRunTimes(document) {
    this.document = document;
    this.creation = this.queuing = this.start = getTimestamp();
}

SuiteRunTimes.prototype.getSerializableProperties = function () {
    var self = this;
    return Object.keys(this).filter(function (k) {
        return k !== 'document' && typeof self[k] === 'string';
    });
};

SuiteRunTimes.prototype.onRunComplete = function () {
    this.finish = getTimestamp();

    var self = this,
        attributes = this.getSerializableProperties(),
        node = this.document
            .ele('Times');


    attributes.forEach(function (k) {
        node.att(k, self[k]);
    });
};

function getTimestamp() {
    // todo: use local time ?
    return (new Date()).toISOString().substr(0, 19);
}

function s4() {
    return Math.floor((1 + Math.random()) * 0x10000)
        .toString(16)
        .substring(1);
}

function newGuid() {
    return s4() + s4() + '-' + s4() + '-' + s4() + '-' + s4() + '-' + s4() + s4() + s4();
}

TRXReporter.$inject = ['baseReporterDecorator', 'config.trxReporter', 'emitter', 'logger', 'helper', 'formatError'];

// PUBLISH DI MODULE
module.exports = {
    'reporter:trx': ['type', TRXReporter]
};
