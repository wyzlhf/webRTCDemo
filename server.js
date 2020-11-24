'use strict'

var log4js = require('log4js');
var http = require('http');
var https = require('https');
var fs = require('fs');
var socketIo = require('socket.io');

var express = require('express');
var serveIndex = require('serve-index');

var USERCOUNT = 3;

log4js.configure({
    appenders: {
        file: {
            type: 'file',
            filename: 'app.log',
            layout: {
                type: 'pattern',
                pattern: '%r %p - %m',
            }
        }
    },
    categories: {
       default: {
          appenders: ['file'],
          level: 'debug'
       }
    }
});

var logger = log4js.getLogger();

var app = express();
app.use(serveIndex('./'));
app.use(express.static('./'));



//http server
var http_server = http.createServer(app);
http_server.listen(80, '10.70.0.105');

var options = {
	key : fs.readFileSync('./cert/stg.closeli.cn.key'),
	cert: fs.readFileSync('./cert/stg.closeli.cn.pem')
}

//https server
var https_server = https.createServer(options, app);
var io = socketIo(https_server);
var cunt = 0;

io.sockets.on('connection', (socket)=> {

	socket.on('message', (room, data)=>{
		if("offer" == data.type || "answer" == data.type){
			//客户端交换offer和answer打印sdp信息
			logger.debug('recv message, room: ' + room + ", data type:" + data.type);
			logger.debug("recv date sdp:", data.sdp);
		}
		else if("candidate" == data.type){
			//客户端交换candidate打印candidate信息
			logger.debug('recv message, room: ' + room + ", data type:" + data.type);
			logger.debug("recv date condidate sdpMLineIndex:", data.label, "candidate:", data.candidate);
		}
		else{
			logger.debug('recv message, room: ' + room + ", data type:" + data.type);
		}
		//给本房间的其它客户端发送数据，其中包括candidate信息和SDP信息
		socket.to(room).emit('message',room, data);
	});

	/*
	socket.on('message', (room)=>{
		logger.debug('message, room: ' + room );
		socket.to(room).emit('message',room);
	});
	*/

	//收到客户端加入房间消息
	socket.on('join', (room)=>{
		socket.join(room);
		logger.debug('room num:' + room);
		//var clients = io.sockets.adapter.rooms[room];
		//var num =Object.keys(clients).length;
		//logger.debug('the user number of room (' + clients + ') is: ' + num);
		var myRoom = io.sockets.adapter.rooms[room]; 
		var users = (myRoom)? Object.keys(myRoom.sockets).length : 0;
		logger.debug('the user number of room (' + room + ') is: ' + users);
		logger.debug('rooms:' + JSON.stringify(io.sockets.adapter.rooms));	
		cunt++;
		if(users < USERCOUNT){
			socket.emit('joined', room, socket.id); //发给除自己之外的房间内的所有人
			if(cunt > 1){
				socket.to(room).emit('otherjoin', room, socket.id);
			}
		
		}else{
			socket.leave(room);	
			socket.emit('full', room, socket.id);
		}
		//socket.emit('joined', room, socket.id); //发给自己
		//socket.broadcast.emit('joined', room, socket.id); //发给除自己之外的这个节点上的所有人
		//io.in(room).emit('joined', room, socket.id); //发给房间内的所有人
	});

	socket.on('leave', (room)=>{

		socket.leave(room);

		var myRoom = io.sockets.adapter.rooms[room]; 
		var users = (myRoom)? Object.keys(myRoom.sockets).length : 0;
		logger.debug('the user number of room is: ' + users);

		//socket.emit('leaved', room, socket.id);
		//socket.broadcast.emit('leaved', room, socket.id);
		socket.to(room).emit('bye', room, socket.id);
		socket.emit('leaved', room, socket.id);
		//io.in(room).emit('leaved', room, socket.id);
	});

});

https_server.listen(443, '10.70.0.105');




