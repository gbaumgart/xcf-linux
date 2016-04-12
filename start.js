var fs = require('fs');
var mkdirp = require('mkdirp');
var path = require('path');
var commander = require('commander');
var util = require('util');
var exec = require('child_process');
var mod_events        = require('events');
var UTILS_ROOT = path.resolve('../../');//Utils
var APP_ROOT = path.resolve('../../../../');//Control-Freak

//----------------
var NGINX_EXE = path.resolve(APP_ROOT+'/nginx');
var NGINX_ARGS = ["-p", APP_ROOT + path.sep];
//----------------
var PHP_CGI = path.resolve(APP_ROOT +'/php/php-cgi');
var PHP_CGI_ARGS = ["-b","127.0.0.1:9011"];
//----------------
var DEVICE_SERVER = path.resolve(UTILS_ROOT +'/app/xide/server');
var DEVICE_SERVER_ARGS = [];

//----------------
var MONGO_SERVER = path.resolve(APP_ROOT+'/mongo/mongod');
var MONGO_SERVER_ARGS = ["--quiet","--dbpath", path.resolve(APP_ROOT + '/data/_MONGO'), "--storageEngine=mmapv1"];

console.log('---start servers');

var extend = require('extend');
var pids = [];
var options = {
    stdout: true,
    stderr: true,
    stdin: true,
    failOnError: true,
    stdinRawMode: false,
    callback:function(err, stdout, stderr){
        console.error('callback',arguments);
        if(err){
            console.error('-errror : '+err);
            return;
        }
        stdout.on('data', function(data) {
            console.log('stdout (' + childProcess.pid + '): ' + data);
            console.dir(data);
        });
    }
};
function start(path,args,options){

    exec.execFile('chmod',['+x',path]);

    var process = exec.spawn(path, args || [],options, function (err, stdout, stderr) {

        if (typeof options.callback === 'function') {
            options.callback.call(this, err, stdout, stderr);
        } else {
            if (err && options.failOnError) {
                //grunt.warn(err);
                console.error('--err ',err);
            }
            //options.callback();
        }
    }.bind(this));

    process.stdout.on('data',function(data){
        console.log('stdout data (' + process.pid + '): ' + data);
    });
    process.stderr.on('data',function(data){
        console.log('stderr data (' + process.pid + '|' + path  + '): \n' + data);
    });
    process.on('close', function(code){
        console.log('child process ' + path + ' exited with code ' + code);
    });

    process.options = options;
    pids.push(process);

    return process;
}
/////////////////////////////////////////////////////////////////////////////////////////////
//
//
//
var nginx = start(NGINX_EXE,NGINX_ARGS,extend({
    kill:NGINX_EXE,
    killCWD:APP_ROOT,
    killArgs:['-s', 'stop']
},options));

console.log('run php in '+ path.resolve(APP_ROOT +'/php/'));
var php = start(PHP_CGI,PHP_CGI_ARGS,extend({
    cwd:path.resolve(APP_ROOT +'/php/')
},options));


var mongoServer = start(MONGO_SERVER,MONGO_SERVER_ARGS,extend({
    cwd:APP_ROOT +''
},options));


var deviceServer = start(DEVICE_SERVER,DEVICE_SERVER_ARGS,extend({
    cwd:path.resolve(UTILS_ROOT +'/app/xide')
},options));


/********************************************************************
 * Keep running and end child processes on SIGINT
 */
process.stdin.resume();
process.on('SIGINT', function() {
    for (var i = 0; i < pids.length; i++) {
        var obj = pids[i];
        if(obj.options.kill){
            var kill = exec.spawn(obj.options.kill,obj.options.killArgs,extend({
                cwd:obj.options.killCWD
            },obj.options),obj.options.killArgs);
            continue;
        }
        try {
            obj.kill(obj.pid);
        }catch(e){
            console.error('error killing ');
        }
    }
    //kill us in latestly 5 secs
    setTimeout(function(){
        process.exit();
    },5000);
});