'use strict'
var localVideo = document.querySelector('video#localvideo');
var remoteVideo = document.querySelector('video#remotevideo');

var btnConn =  document.querySelector('button#connserver');
var btnLeave = document.querySelector('button#leave');

var offer = document.querySelector('textarea#offer');
var answer = document.querySelector('textarea#answer');

var report = document.querySelector('textarea#report');
var shareDeskBox  = document.querySelector('input#shareDesk');
var bandWidth  = document.querySelector('select#bandWidth');


let bitrateGraph;
let bitrateSeries;

let packetGraph;
let packetSeries;

let lastResult;

var pcConfig = {
  'iceServers': [
	{'urls': 'stun:srs.stg.closeli.cn:3478'},
	{
    'urls': 'turn:srs.stg.closeli.cn:3478',
    'credential': "123456",
    'username': "tianye"
    }]
};

// stun和turn服务器
var iceServer = {
	"iceServers": [{
		"url": "stun:srs.stg.closeli.cn:3478"
	}, {
		"url": "turn:srs.stg.closeli.cn:3478",
		"username": "tianye",
		"credential": "123456"
	}]
};
		
var localStream = null;
var remoteStream = null;

var pc = null;

var roomid;
var socket = null;

var offerdesc = null;
var state = 'init';


//设置定时器获取一些码流信息
var timeoutId = setTimeout(updateCurTime, 1000);
function updateCurTime()
{
	var date=new Date();  
	var year=date.getFullYear(); //获取当前年份  
	var mon=date.getMonth()+1; //获取当前月份  
	var da=date.getDate(); //获取当前日  
	var day=date.getDay(); //获取当前星期几  
	var h=date.getHours(); //获取小时  
	var m=date.getMinutes(); //获取分钟  
	var s=date.getSeconds(); //获取秒  
	var d=document.getElementById('Date');  
	d.innerHTML='当前时间:'+year+'年'+mon+'月'+da+'日'+'星期'+day+' '+h+':'+m+':'+s;
	clearTimeout(timeoutId); //清除上一次的定时器，否则会无限开多个
	setTimeout(updateCurTime, 1000);//方法中调用定时器实现循环
}

var timeInterId = setInterval(getReportStates, 1000);

function getReportStates()
{
	if(pc != null){
		pc.getStats(null).then(stats =>{
			let statsOutput = "";
			stats.forEach(report => {
				//格式化以字符串形式显示report对象值
				statsOutput += JSON.stringify(report, null, 2);
			});
			report.value = statsOutput;
		});
	}
	//达到什么条件最后可以销毁该对象
	//clearInterval(timeInterId);
}

//允许设置发送码流的带宽码率
function changeBw(){
	bandWidth.disabled = true;
	var bwKbps = bandWidth.options[bandWidth.selectedIndex].value;

	var vSender = null;
	var senders = pc.getSenders();
	senders.forEach(sender =>{
		if(sender && sender.track && sender.track.kind === 'video'){
			vSender = sender;
		}
	});
	var parameters = vSender.getParameters();
	if(!parameters.encodings){
		return;
	}

	if(bwKbps === "unlimited"){
		return;
	}
	//换算单位
	parameters.encodings[0].maxBitrate = bwKbps*1000;
	vSender.setParameters(parameters)
	.then(()=>{
		bandWidth.disabled = false;
		console.log("set parameters successed, rate:kbps", bwKbps);
	})
	.catch(err =>{
		console.error(err);
	})
}







// 以下代码是从网上找的
//=========================================================================================
//如果返回的是false说明当前操作系统是手机端，如果返回的是true则说明当前的操作系统是电脑端

function IsPC() {
	var userAgentInfo = navigator.userAgent;
	var Agents = ["Android", "iPhone","SymbianOS", "Windows Phone","iPad", "iPod"];
	var flag = true;

	for (var v = 0; v < Agents.length; v++) {
		if (userAgentInfo.indexOf(Agents[v]) > 0) {
			flag = false;
			break;
		}
	}

	return flag;
}

//如果返回true 则说明是Android  false是ios
function is_android() {
	var u = navigator.userAgent, app = navigator.appVersion;
	var isAndroid = u.indexOf('Android') > -1 || u.indexOf('Linux') > -1; //g
	var isIOS = !!u.match(/\(i[^;]+;( U;)? CPU.+Mac OS X/); //ios终端
	if (isAndroid) {
		//这个是安卓操作系统
		return true;
	}

	if (isIOS) {
      　　//这个是ios操作系统
     　　 return false;
	}
}

//获取url参数
function getQueryVariable(variable)
{
       var query = window.location.search.substring(1);
       var vars = query.split("&");
       for (var i=0;i<vars.length;i++) {
               var pair = vars[i].split("=");
               if(pair[0] == variable){return pair[1];}
       }
       return(false);
}

//=======================================================================

function sendMessage(roomid, data){

	console.log('send message to other end', roomid, data);
	if(!socket){
		console.log('socket is null');
	}
	socket.emit('message', roomid, data);
}

function conn(){

	//socket io会捕获到url信息，从而会信令链接服务器
	socket = io.connect();

	socket.on('joined', (roomid, id) => {
		console.log('receive joined message!', "roomid:"+roomid, "socketid"+id);
		state = 'joined'

		//如果是多人的话，第一个人不该在这里创建peerConnection
		//都等到收到一个otherjoin时再创建
		//所以，在这个消息里应该带当前房间的用户数
		//
		//create conn and bind media track
		createPeerConnection();
		bindTracks();

		btnConn.disabled = true;
		btnLeave.disabled = false;
		bandWidth.disabled = true;
		console.log('receive joined message, state=', state);
	});

	socket.on('otherjoin', (roomid) => {
		console.log('receive joined message:', roomid, state);

		//如果是多人的话，每上来一个人都要创建一个新的 peerConnection
		//
		if(state === 'joined_unbind'){
			createPeerConnection();
			bindTracks();
		}

		state = 'joined_conn';
		call();

		console.log('receive other_join message, state=', state);
	});

	socket.on('full', (roomid, id) => {
		console.log('receive full message', roomid, id);
		socket.disconnect();
		hangup();
		closeLocalMedia();
		state = 'leaved';
		bandWidth.disabled = false;
		console.log('receive full message, state=', state);
		alert('the room is full!');
	});

	socket.on('leaved', (roomid, id) => {
		console.log('receive leaved message', roomid, id);
		state='leaved'
		socket.disconnect();
		console.log('receive leaved message, state=', state);

		btnConn.disabled = false;
		btnLeave.disabled = true;
		bandWidth.disabled = false;
	});

	socket.on('bye', (room, id) => {
		console.log('receive bye message', roomid, id);
		//state = 'created';
		//当是多人通话时，应该带上当前房间的用户数
		//如果当前房间用户不小于 2, 则不用修改状态
		//并且，关闭的应该是对应用户的peerconnection
		//在客户端应该维护一张peerconnection表，它是
		//一个key:value的格式，key=userid, value=peerconnection
		state = 'joined_unbind';
		hangup();
		offer.value = '';
		answer.value = '';
		bandWidth.disabled = false;
		console.log('receive bye message, state=', state);
	});

	socket.on('disconnect', (socket) => {
		console.log('receive disconnect message!', roomid);
		if(!(state === 'leaved')){
			hangup();
			closeLocalMedia();

		}
		state = 'leaved';
		bandWidth.disabled = false;
		console.log('receive bye message, state=', state);
	
	});

	socket.on('message', (roomid, data) => {
		console.log('receive message!', roomid, data);

		if(data === null || data === undefined){
			console.error('the message is invalid!');
			return;	
		}

		if(data.hasOwnProperty('type') && data.type === 'offer') {
			
			offer.value = data.sdp;

			pc.setRemoteDescription(new RTCSessionDescription(data));

			//create answer，可以再这里对音视频进行约束，第三个参数
			pc.createAnswer()
				.then(getAnswer)
				.catch(handleAnswerError);

		}else if(data.hasOwnProperty('type') && data.type == 'answer'){
			answer.value = data.sdp;
			pc.setRemoteDescription(new RTCSessionDescription(data));
			bandWidth.disabled = false;
		
		}else if (data.hasOwnProperty('type') && data.type === 'candidate'){
			//收到信令服务器发送的candidate数据，则添加到本地pc上
			var candidate = new RTCIceCandidate({
				sdpMLineIndex: data.label,
				candidate: data.candidate
			});
			console.log("recv date condidate sdpMLineIndex:", data.label, "candidate", data.candidate);
			pc.addIceCandidate(candidate);	
		
		}else{
			console.log('the message is invalid!', data);
		
		}
	
	});

	//从url中取出roomid值，加入房间
	roomid = getQueryVariable('room');
	socket.emit('join', roomid);

	return true;
}

function connSignalServer(){
	
	//开启本地视频
	start();

	return true;
}

function getMediaStream(stream){

	//获取本地视频流并用HTML5本地播放器播放
	if(localStream){
		stream.getAudioTracks().forEach((track)=>{
			localStream.addTrack(track);	
			stream.removeTrack(track);
		});
	}else{
		localStream = stream;	
	}

	localVideo.srcObject = localStream;
	//画图使用
	bitrateSeries = new TimelineDataSeries();
	bitrateGraph = new TimelineGraphView('bitrateGraph', 'bitrateCanvas');
	bitrateGraph.updateEndDate();

	packetSeries = new TimelineDataSeries();
	packetGraph = new TimelineGraphView('packetGraph', 'packetCanvas');
	packetGraph.updateEndDate();
	//这个函数的位置特别重要，
	//一定要放到getMediaStream之后再调用
	//否则就会出现绑定失败的情况
	//
	//setup connection
	conn();

	//btnStart.disabled = true;
	//btnCall.disabled = true;
	//btnHangup.disabled = true;
}

function getDeskStream(stream){
	localStream = stream;
}

function handleError(err){
	console.error('Failed to get Media Stream!', err);
}

function shareDesk(){

	if(IsPC()){
		navigator.mediaDevices.getDisplayMedia({video: true})
			.then(getDeskStream)
			.catch(handleError);

		return true;
	}

	return false;

}

function start(){

	if(!navigator.mediaDevices ||
		!navigator.mediaDevices.getUserMedia){
		console.error('the getUserMedia is not supported!');
		return;
	}else {

		var constraints;

		if( shareDeskBox.checked && shareDesk()){

			constraints = {
				video: false,
				audio:  {
					echoCancellation: true,
					noiseSuppression: true,
					autoGainControl: true
				}
			}

		}else{
			constraints = {
				video: {
					width:640,
					height:480
				},
				audio:  {
					echoCancellation: true,
					noiseSuppression: true,
					autoGainControl: true
				}
			}
		}

		navigator.mediaDevices.getUserMedia(constraints)
					.then(getMediaStream)
					.catch(handleError);
	}

}

function getRemoteStream(e){
	//添加远端音视频到本地Video播放器进行播放展示
	remoteStream = e.streams[0];
	remoteVideo.srcObject = e.streams[0];
	bandWidth.disabled = false;
}

function handleOfferError(err){
	console.error('Failed to create offer:', err);
}

function handleAnswerError(err){
	console.error('Failed to create answer:', err);
}

function getAnswer(desc){
	//获取本地的SDP信息则会向stun和turn询问本地的候选者
	pc.setLocalDescription(desc);
	answer.value = desc.sdp;

	//send answer sdp
	sendMessage(roomid, desc);
}

function getOffer(desc){

	//获取本地的SDP信息则会向stun和turn询问本地的候选者
	pc.setLocalDescription(desc);
	offer.value = desc.sdp;
	offerdesc = desc;

	//send offer sdp
	sendMessage(roomid, offerdesc);	

}

function createPeerConnection(){

	//如果是多人的话，在这里要创建一个新的连接.
	//新创建好的要放到一个map表中。
	//key=userid, value=peerconnection
	console.log('create RTCPeerConnection!');
	if(!pc){
		pc = new RTCPeerConnection(pcConfig);

		//端到端连接通的回调,这是来自询问了stun和turn服务器得到信息之后的回调
		pc.onicecandidate = (e)=>{
			
			//将该信息通过信息服务器通知到房间其它人
			if(e.candidate) {
				sendMessage(roomid, {
					type: 'candidate',
					label:event.candidate.sdpMLineIndex, 
					id:event.candidate.sdpMid, 
					candidate: event.candidate.candidate
				});
			}else{
				console.log('this is the end candidate');
			}
		}

		//收到远端的码流的回调函数
		pc.ontrack = getRemoteStream;
	}else {
		console.log('the pc have be created!');
	}

	return;	
}

//绑定永远与 peerconnection在一起，
//所以没必要再单独做成一个函数
function bindTracks(){

	console.log('bind tracks into RTCPeerConnection!');

	if( pc === null || localStream === undefined) {
		console.error('pc is null or undefined!');
		return;
	}

	if(localStream === null || localStream === undefined) {
		console.error('localstream is null or undefined!');
		return;
	}

	//add all track into peer connection
	localStream.getTracks().forEach((track)=>{
		pc.addTrack(track, localStream);	
	});

}

function call(){
	
	if(state === 'joined_conn'){

		var offerOptions = {
			offerToRecieveAudio: 1,
			offerToRecieveVideo: 1
		}

		pc.createOffer(offerOptions)
			.then(getOffer)
			.catch(handleOfferError);
	}
}

function hangup(){

	if(!pc) {
		return;
	}

	offerdesc = null;
	
	pc.close();
	pc = null;

}

function closeLocalMedia(){

	if(!(localStream === null || localStream === undefined)){
		localStream.getTracks().forEach((track)=>{
			track.stop();
		});
	}
	localStream = null;
}

function leave() {

	socket.emit('leave', roomid); //notify server

	hangup();
	closeLocalMedia();

	offer.value = '';
	answer.value = '';
	btnConn.disabled = false;
	bandWidth.disabled = false;
	btnLeave.disabled = true;
}


var timeIdToGraph = setInterval(drawReportGraphs, 1000);
function drawReportGraphs(){

	if(!pc){
		console.log("pc is null!");
		return;	
	}

	var sender = pc.getSenders()[0];
	if(!sender){
		console.log("send onject is null");
		return;	
	}

	sender.getStats()
		.then(reports => {
			reports.forEach(report =>{
			console.log(report);
			//我们只对 outbound-rtp 型的 Report 做处理
			if(report.type === 'outbound-rtp'){
				if(report.isRemote){
					console.log("send remote is false");
					return;	
				}

				var curTs = report.timestamp;
				var bytes = report.bytesSent;
				var packets = report.packetsSent;

				if(lastResult && lastResult.has(report.id)){
					var lastBytes = lastResult.get(report.id).bytesSent;
					var lastTs = lastResult.get(report.id).timestamp;
					var bitratePs = 8 * (bytes - lastBytes)/(curTs - lastTs)*1000;	
					var packetPs =  packets - lastResult.get(report.id).packetsSent;
					console.log("bitrate:", bitratePs, "packet:", packetPs);
					//绘制发送码率随时间变化情况
					bitrateSeries.addPoint(curTs, bitratePs);
					bitrateGraph.setDataSeries([bitrateSeries]);
					bitrateGraph.updateEndDate();

					//绘制发送包随时间变化情况
					packetSeries.addPoint(curTs,packetPs);
					packetGraph.setDataSeries([packetSeries]);
					packetGraph.updateEndDate();
					}
				
				}
			
			});
			lastResult = reports;
		
		})
		.catch(err=>{
			console.error(err);
		});

}

btnConn.onclick = connSignalServer
btnLeave.onclick = leave;
bandWidth.onchange = changeBw;
