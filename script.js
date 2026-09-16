const canvas=document.getElementById("mathCanvas"),ctx=canvas.getContext("2d");
let w,h,dots=[];
function resize(){w=canvas.width=innerWidth;h=canvas.height=innerHeight;dots=Array.from({length:45},()=>({x:Math.random()*w,y:Math.random()*h,vx:(Math.random()-.5)*.25,vy:(Math.random()-.5)*.25,r:M[...]
function draw(){ctx.clearRect(0,0,w,h);ctx.fillStyle="rgba(183,255,60,.5)";for(const p of dots){p.x+=p.vx;p.y+=p.vy;if(p.x<0||p.x>w)p.vx*=-1;if(p.y<0||p.y>h)p.vy*=-1;ctx.beginPath();ctx.arc(p.x,p.y[...]
addEventListener("resize",resize);resize();draw();
document.querySelector(".menu").addEventListener("click",()=>{const n=document.querySelector(".nav nav");n.style.display=n.style.display==="flex"?"none":"flex";n.style.position="absolute";n.style.t[...]
