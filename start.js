var fs = require('fs');
var mkdirp = require('mkdirp');
var path = require('path');
var commander = require('commander');
var util = require('util');
var exec = require('child_process');
var tracer = require('tracer');
var UTILS_ROOT = path.resolve('../../');//Utils
var APP_ROOT = path.resolve('../../../../');//Control-Freak
var eol = require('os').EOL;

var old = console;
var console = console;
if(tracer){
    console = tracer.colorConsole({
        format : "{{title}}: {{message}}",
        dateformat : "HH:MM:ss.L"
    });
}

var os = require('os');
var OS = "linux";
if(os.platform() ==='win32'){
    OS = 'windows';
}else if(os.platform() ==='darwin'){
    OS = 'osx';
}else if(os.arch() === 'arm'){
    OS = 'arm';
}

if(!Array.prototype.remove){
    Array.prototype.remove= function(){
        var what, a= arguments, L= a.length, ax;
        while(L && this.length){
            what= a[--L];
            if(this.indexOf==null){
                break;
            }
            while((ax= this.indexOf(what))!= -1){
                this.splice(ax, 1);
            }
        }
        return this;
    };
}

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
var MONGO_SERVER_ARGS = ["--smallfiles","--quiet","--dbpath", path.resolve(APP_ROOT + '/data/_MONGO'), "--storageEngine=mmapv1"];

console.log('---start servers');

var extend = require('extend');
var pids = [];
var options = {
    stdout: true,
    stderr: true,
    stdin: true,
    failOnError: true,
    stdinRawMode: false,
    //silent:false,
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

function mongoReady(){
    var deviceServer = start(DEVICE_SERVER,DEVICE_SERVER_ARGS,extend({
        cwd:path.resolve(UTILS_ROOT +'/app/xide')
    },options),"Device - Server");
}
function start(path,args,options,name){

    if(OS!=="windows") {
        try {
            exec.execFile('chmod', ['+x', path]);
        }catch(e){}
    }

    if(OS=='windows'){
        path+='.exe';
    }

    if(!fs.existsSync(path)){
        console.error("Sorry, but cant start "+name +'. ' +path +'doesnt exists!');
        return;
    }

    console.info('Start '+ name);

    options.path = path;
    options.name = name;

    var process = exec.spawn(path, args || [],options, function (err, stdout, stderr) {
        if (typeof options.callback === 'function') {
            options.callback.call(this, err, stdout, stderr);
        } else {
            if (err && options.failOnError) {
                console.error('--err ',err);
            }
            //options.callback();
        }
    }.bind(this));

    process.stdout.on('data',function(data){

        var str = data.toString();

        if(options.silent) {

        }else{
            console.debug('stdout data (pid:' + process.pid + ' name:' + name + '):');
            console.log(name +'\n\t' + str);
        }

        if(options.already && str.indexOf(options.already)!==-1){
            console.warn('Abort '+options.name +' , seems already running.');
            pids.remove(process);
            options.killed=true;
            if(options.alreadyCallback){
                options.alreadyCallback();
            }
        }
        if(options.ready && options.readyCB && str.indexOf(options.ready)!==-1){
            options.readyCB();
        }

    });
    process.stderr.on('data',function(data){
        console.debug('stderr data (pid:' + process.pid + ' name:' + name + '):');

        var str = data.toString();

        var newStr = String(str).split(eol).join(eol + '\t');
        console.log(name + '\n\t' + newStr);

        if(options.already && str.indexOf(options.already)!==-1){
            console.warn('Abort '+options.name+' , seems already running.');
            pids.remove(process);
            options.killed=true;
            if(options.alreadyCallback){
                options.alreadyCallback();
            }

        }
    });
    process.on('close', function(code){
        console.debug('Child process ' + options.name + ' ' + ' exited with code ' + code);

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
},options),"NGINX");

var php = start(PHP_CGI,PHP_CGI_ARGS,extend({
    cwd:path.resolve(APP_ROOT +'/php/'),
    already:"Address already in use"
},options),"PHP");

var mongoServer = start(MONGO_SERVER,MONGO_SERVER_ARGS,extend({
    cwd:APP_ROOT +'',
    already:"Address already in use",
    alreadyCallback:mongoReady,
    silent:true,
    ready:"waiting for connections on port",
    readyCB:mongoReady
},options),"Mongo");


/********************************************************************
 * Keep running and end child processes on SIGINT
 */
process.stdin.resume();
process.on('SIGINT', function() {
    for (var i = 0; i < pids.length; i++) {
        var obj = pids[i];
        var options = obj.options;
        console.log('Stopping '+options.name);
        if(obj.options.kill){

            var kill = exec.spawn(obj.options.kill,obj.options.killArgs,extend({
                cwd:obj.options.killCWD
            },obj.options),obj.options.killArgs);
            continue;
        }
        try {
            obj.kill(obj.pid);
        }catch(e){
            //console.error('error killing '+options.name,e);
        }
    }
    //kill us in latestly 5 secs
    setTimeout(function(){
        process.exit();
    },5000);
});