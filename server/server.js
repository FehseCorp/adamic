// Install
// npm install
// 
// Run
// npm run
// Arg0 = language locale - en-US, etc.
// Arg1 = speech key
const myArgs = process.argv.slice(2);
//console.log('myArgs: ', myArgs);
//const fs = require("fs");
const sdk = require("microsoft-cognitiveservices-speech-sdk");
const speechConfig = sdk.SpeechConfig.fromSubscription(myArgs[1], "eastus2");
speechConfig.speechRecognitionLanguage = myArgs[0];
//Transation
const speechTranslationConfig = sdk.SpeechTranslationConfig.fromSubscription(myArgs[1], "eastus2");
speechTranslationConfig.speechRecognitionLanguage = "en-US";

var language = "pt";
speechTranslationConfig.addTargetLanguage(language);

var fs = require('fs');
var path = require('path');
var net = require('net');
var wav = require('wav'); // https://github.com/TooTallNate/node-wav

// For this simple test, just create wav files in the "out" directory in the directory
// where audioserver.js lives.
var outputDir = path.join(__dirname, "out");  

var dataPort = 7123; // this is the port to listen on for data from the Photon

// If changing the sample frequency in the Particle code, make sure you change this!
var wavOpts = {
	'channels':1,
	'sampleRate':16000,
	'bitDepth':8
};

// Output files in the out directory are of the form 00001.wav. lastNum is used 
// to speed up scanning for the next unique file.
var lastNum = 0;

// Create the out directory if it does not exist
try {
	fs.mkdirSync(outputDir);
}
catch(e) {
}

// Start a TCP Server. This is what receives data from the Particle Photon
// https://gist.github.com/creationix/707146
net.createServer(function (socket) {
	console.log('data connection started from ' + socket.remoteAddress);
	// The server sends a 8-bit byte value for each sample. Javascript doesn't really like
	// binary values, so we use setEncoding to read each byte of a data as 2 hex digits instead.
	socket.setEncoding('hex');
	var outPath = getUniqueOutputPath();
	var writer = new wav.FileWriter(outPath, wavOpts);
	socket.on('data', function (data) {
		// We received data on this connection.
		var buf = Buffer.from(data, 'hex');
		//var buf = new Buffer(data, 'hex');

		if (wavOpts.bitDepth == 16) {
			// The Photon sends up unsigned data for both 8 and 16 bit
			// The wav file format is unsigned for 8 bit and signed two-complement for 16-bit. Go figure.
			for(var ii = 0; ii < buf.length; ii += 2) {
				var unsigned = buf.readUInt16LE(ii);
				var signed = unsigned - 32768;
				buf.writeInt16LE(signed, ii);
			}
		}
		
		// console.log("got data " + (data.length / 2));
		writer.write(buf);
	});
	socket.on('end', function () {
		console.log('transmission complete, saved to ' + outPath);
		writer.end();
		// finished writing the file
		fromFile(outPath);
	});
}).listen(dataPort);


function formatName(num) {
	var s = num.toString();
	
	while(s.length < 5) {
		s = '0' + s;
	}
	return s + '.wav';
}

function getUniqueOutputPath() {
	for(var ii = lastNum + 1; ii < 99999; ii++) {
		var outPath = path.join(outputDir, formatName(ii));
		try {
			fs.statSync(outPath);
		}
		catch(e) {
			// File does not exist, use this one
			lastNum = ii;
			return outPath;
		}
	}
	lastNum = 0;
	return "00000.wav";
}

function fromFile(outFile) {
	console.log("fromFile: " + outFile);
    let audioConfig = sdk.AudioConfig.fromWavFileInput(fs.readFileSync(outFile));
    let speechRecognizer = new sdk.SpeechRecognizer(speechConfig, audioConfig);

    let translationRecognizer = new sdk.TranslationRecognizer(speechTranslationConfig, audioConfig);

    speechRecognizer.recognizeOnceAsync(result => {
        switch (result.reason) {
            case sdk.ResultReason.RecognizedSpeech:
                console.log(`RECOGNIZED: Text=${result.text}`);
				textHandler(result.text);
                break;
            case sdk.ResultReason.NoMatch:
                console.log("NOMATCH: Speech could not be recognized.");
                break;
            case sdk.ResultReason.Canceled:
                const cancellation = sdk.CancellationDetails.fromResult(result);
                console.log(`CANCELED: Reason=${cancellation.reason}`);

                if (cancellation.reason == sdk.CancellationReason.Error) {
                    console.log(`CANCELED: ErrorCode=${cancellation.ErrorCode}`);
                    console.log(`CANCELED: ErrorDetails=${cancellation.errorDetails}`);
                    console.log("CANCELED: Did you set the speech resource key and region values?");
                }
                break;
        }
        speechRecognizer.close();
    });
	translationRecognizer.recognizeOnceAsync(result => {
        switch (result.reason) {
            case sdk.ResultReason.TranslatedSpeech:
                console.log(`RECOGNIZED: Text=${result.text}`);
                console.log("Translated into [" + language + "]: " + result.translations.get(language));

                break;
            case sdk.ResultReason.NoMatch:
                console.log("NOMATCH: Speech could not be recognized.");
                break;
            case sdk.ResultReason.Canceled:
                const cancellation = sdk.CancellationDetails.fromResult(result);
                console.log(`CANCELED: Reason=${cancellation.reason}`);

                if (cancellation.reason == sdk.CancellationReason.Error) {
                    console.log(`CANCELED: ErrorCode=${cancellation.ErrorCode}`);
                    console.log(`CANCELED: ErrorDetails=${cancellation.errorDetails}`);
                    console.log("CANCELED: Did you set the speech resource key and region values?");
                }
                break;
        }
        translationRecognizer.close();
    });

}

function textHandler(text) {
const { exec } = require('child_process');
var yourscript = exec('bash ./sendParticleData.sh "' + text + '" >/dev/null',
        (error, stdout, stderr) => {
            console.log(stdout);
            console.log(stderr);
            if (error !== null) {
                console.log(`exec error: ${error}`);
            }
        });
}