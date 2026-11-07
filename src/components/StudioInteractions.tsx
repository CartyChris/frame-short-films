import {useEffect,useLayoutEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {buttonHelp,resolveQuickMenu,type QuickMenu} from './studio-interactions';
import './studio-interactions.css';

type Point={x:number;y:number};
type Tip=Point&{label:string;description?:string};
type OpenMenu=Point&QuickMenu&{trigger:HTMLElement};
const clamp=(n:number,min:number,max:number)=>Math.max(min,Math.min(max,n));
/** Help and quick actions augment the editor's existing controls. Native text editing menus remain intact. */
export function StudioInteractions(){
 const [tip,setTip]=useState<Tip>(),[menu,setMenu]=useState<OpenMenu>();
 const menuRef=useRef<HTMLDivElement>(null),tipTarget=useRef<HTMLElement|undefined>(undefined),descriptionBefore=useRef<string|null>(null);
 const tipId='frame-button-help';
 function clearDescription(){const target=tipTarget.current;if(target){const parts=(target.getAttribute('aria-describedby')||'').split(/\s+/).filter(v=>v&&v!==tipId);if(parts.length)target.setAttribute('aria-describedby',parts.join(' '));else target.removeAttribute('aria-describedby');}tipTarget.current=undefined;descriptionBefore.current=null}
 function describe(target:HTMLElement,point:Point){clearDescription();tipTarget.current=target;descriptionBefore.current=target.getAttribute('aria-describedby');const parts=(descriptionBefore.current||'').split(/\s+/).filter(Boolean);if(!parts.includes(tipId))parts.push(tipId);target.setAttribute('aria-describedby',parts.join(' '));setTip({...point,...buttonHelp(target)})}
 useEffect(()=>{
  const root=document.querySelector<HTMLElement>('.app');if(!root)return;
  let timer:ReturnType<typeof setTimeout>|undefined,touchTimer:ReturnType<typeof setTimeout>|undefined,touchStart:Point|undefined,touchTarget:Element|undefined,suppressTarget:Element|undefined,hoverPoint:Point={x:0,y:0};
  const clearTimer=()=>{clearTimeout(timer);timer=undefined};
  const hideTip=()=>{clearTimer();clearDescription();setTip(undefined)};
  const showMenu=(target:Element,point:Point)=>{const content=resolveQuickMenu(root,target);if(!content?.actions.length)return false;const trigger=target instanceof HTMLElement?target:target.closest<HTMLElement>('button,[role="button"]')||root;hideTip();setMenu({...content,...point,trigger});return true};
  const button=(target:EventTarget|null)=>target instanceof Element?target.closest<HTMLElement>('button,[role="button"]'):null;
  const over=(event:PointerEvent)=>{if(event.pointerType==='touch')return;const el=button(event.target);if(!el||!root.contains(el))return;clearTimer();hoverPoint={x:event.clientX+16,y:event.clientY+18};timer=setTimeout(()=>describe(el,hoverPoint),320)};
  const move=(event:PointerEvent)=>{hoverPoint={x:event.clientX+16,y:event.clientY+18};if(touchStart&&Math.hypot(event.clientX-touchStart.x,event.clientY-touchStart.y)>10){clearTimeout(touchTimer);touchStart=undefined}if(event.pointerType==='mouse'&&tipTarget.current)setTip(t=>t?{...t,x:event.clientX+16,y:event.clientY+18}:t)};
  const out=(event:PointerEvent)=>{const el=button(event.target);if(el&&(!event.relatedTarget||!(event.relatedTarget instanceof Node)||!el.contains(event.relatedTarget)))hideTip()};
  const focus=(event:FocusEvent)=>{const el=button(event.target);if(!el||!root.contains(el))return;const rect=el.getBoundingClientRect();clearTimer();timer=setTimeout(()=>describe(el,{x:rect.left,y:rect.bottom+8}),320)};
  const blur=(event:FocusEvent)=>{if(button(event.target))hideTip()};
  const context=(event:MouseEvent)=>{if(!(event.target instanceof Element))return;if(showMenu(event.target,{x:event.clientX,y:event.clientY})){if(touchStart&&touchTarget){clearTimeout(touchTimer);suppressTarget=touchTarget}event.preventDefault();event.stopPropagation()}};
  const key=(event:KeyboardEvent)=>{if(event.key==='Escape'){hideTip();setMenu(undefined);return}if((event.key==='ContextMenu'||event.shiftKey&&event.key==='F10')&&document.activeElement instanceof HTMLElement&&root.contains(document.activeElement)){const el=document.activeElement,r=el.getBoundingClientRect();if(showMenu(el,{x:r.left,y:r.bottom})){event.preventDefault();event.stopPropagation()}}};
  const down=(event:PointerEvent)=>{if(event.pointerType!=='touch'||!(event.target instanceof Element))return;const target=event.target;touchTarget=target;touchStart={x:event.clientX,y:event.clientY};clearTimeout(touchTimer);touchTimer=setTimeout(()=>{if(touchStart&&touchTarget&&showMenu(touchTarget,{x:touchStart.x,y:touchStart.y})){suppressTarget=touchTarget}},600)};
  const up=()=>{clearTimeout(touchTimer);touchStart=undefined;touchTarget=undefined;setTimeout(()=>{suppressTarget=undefined},800)};
  const click=(event:MouseEvent)=>{if(suppressTarget&&event.target instanceof Node&&(event.target===suppressTarget||suppressTarget.contains(event.target))){event.preventDefault();event.stopPropagation();suppressTarget=undefined}};
  root.addEventListener('pointerover',over);root.addEventListener('pointermove',move);root.addEventListener('pointerout',out);root.addEventListener('focusin',focus);root.addEventListener('focusout',blur);root.addEventListener('contextmenu',context);root.addEventListener('pointerdown',down);root.addEventListener('pointerup',up);root.addEventListener('pointercancel',up);root.addEventListener('click',click,true);document.addEventListener('keydown',key,true);
  return()=>{clearTimeout(timer);clearTimeout(touchTimer);clearDescription();root.removeEventListener('pointerover',over);root.removeEventListener('pointermove',move);root.removeEventListener('pointerout',out);root.removeEventListener('focusin',focus);root.removeEventListener('focusout',blur);root.removeEventListener('contextmenu',context);root.removeEventListener('pointerdown',down);root.removeEventListener('pointerup',up);root.removeEventListener('pointercancel',up);root.removeEventListener('click',click,true);document.removeEventListener('keydown',key,true)};
 },[]);
 useLayoutEffect(()=>{if(!menu||!menuRef.current)return;const el=menuRef.current,rect=el.getBoundingClientRect();el.style.left=`${clamp(menu.x,8,Math.max(8,innerWidth-rect.width-8))}px`;el.style.top=`${clamp(menu.y,8,Math.max(8,innerHeight-rect.height-8))}px`;el.querySelector<HTMLButtonElement>('[role="menuitem"]:not(:disabled)')?.focus({preventScroll:true});},[menu]);
 useEffect(()=>{if(!menu)return;const outside=(event:PointerEvent)=>{if(event.target instanceof Node&&!menuRef.current?.contains(event.target))setMenu(undefined)};const resize=()=>setMenu(undefined);const scroll=(event:Event)=>{if(!(event.target instanceof Node)||!menuRef.current?.contains(event.target))setMenu(undefined)};document.addEventListener('pointerdown',outside,true);document.addEventListener('scroll',scroll,true);addEventListener('resize',resize);return()=>{document.removeEventListener('pointerdown',outside,true);document.removeEventListener('scroll',scroll,true);removeEventListener('resize',resize)}},[menu]);
 if(typeof document==='undefined')return null;
 const visibleTip=tip&&!menu;
 return createPortal(<>
  {visibleTip&&<div id={tipId} role="tooltip" className="frame-button-help" style={{left:clamp(tip.x,8,Math.max(8,innerWidth-250)),top:clamp(tip.y,8,Math.max(8,innerHeight-90))}}><strong>{tip.label}</strong>{tip.description&&<span>{tip.description}</span>}</div>}
  {menu&&<div ref={menuRef} role="menu" aria-label={`${menu.title} quick actions`} className="frame-quick-menu" style={{left:menu.x,top:menu.y}} onKeyDown={e=>{const items=[...e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)')];const index=items.indexOf(document.activeElement as HTMLButtonElement);if(e.key==='Escape'){e.preventDefault();e.stopPropagation();setMenu(undefined);menu.trigger.focus()}else if(['ArrowDown','ArrowUp','Home','End'].includes(e.key)){e.preventDefault();const next=e.key==='Home'?0:e.key==='End'?items.length-1:e.key==='ArrowDown'?(index+1)%items.length:(index-1+items.length)%items.length;items[next]?.focus()}}}>
   <div className="frame-quick-menu-title">{menu.title}</div>{menu.actions.map((action,index)=><button key={index} type="button" role="menuitem" disabled={action.disabled} onClick={()=>{setMenu(undefined);action.run()}}><strong>{action.label}</strong>{action.description&&<small>{action.description}</small>}</button>)}
  </div>}
 </>,document.body);
}
