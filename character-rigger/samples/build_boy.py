"""Build boy.rigger.json (a ready rig) from the cut parts in boy-parts/. Re-run after tweaking numbers."""
import base64, json, os
k = 0.28  # sheet px -> editor units
d = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'boy-parts')
names = ['hair_back','hair_front','head','shirt','shorts','arm_far','arm_near','leg_far','leg_near','sandal_a','sandal_b']
images = [{'name': n, 'src': 'data:image/png;base64,' + base64.b64encode(open(f'{d}/{n}.png','rb').read()).decode()} for n in names]
def B(name, parent, x, y, rot=0, length=30, physics=None):
    b = dict(name=name, parent=parent, x=round(x*k,2), y=round(y*k,2), rotation=rot, scaleX=1, scaleY=1, length=length)
    if physics: b['physics'] = physics
    return b
hair_sp = lambda ph: dict(stiffness=70, damping=6, wind=2.5, freq=.5, phase=ph, drag=.03, inertia=.4, limit=18)
bones = [B('root',None,0,0,0,20), B('hip','root',0,-205,0,14),
  B('legFar','hip',-45,0,90,50), B('legNear','hip',35,0,90,50), B('body','hip',0,0,0,20),
  B('head','body',0,-395,0,30), B('hairBack','head',-50,-455,0,20,hair_sp(0)), B('hairFront','head',-55,-470,0,20,hair_sp(.8)),
  B('armFar','body',-15,-345,90,50), B('armNear','body',35,-345,90,50)]
def A(name, image, x, y, rot, px, py, sc=1):
    return dict(name=name, image=image, x=round(x*k,2), y=round(y*k,2), rotation=rot, scale=round(k*sc,4), pivotX=px, pivotY=py)
def SL(name, bone, att): return dict(name=name, bone=bone, attachment=att['name'], attachments=[att])
slots = [
  SL('hair_back','hairBack',A('default','hair_back',0,0,0,.5,0)),
  SL('arm_far','armFar',A('default','arm_far',0,0,-90,.5,.1)),
  SL('leg_far','legFar',A('default','leg_far',0,0,-90,.38,.03)),
  SL('leg_near','legNear',A('default','leg_near',0,0,-90,.38,.03)),
  SL('shorts','hip',A('default','shorts',0,20,0,.5,1)),
  SL('shirt','body',A('default','shirt',0,-165,0,.5,1)),
  SL('head','head',A('default','head',0,0,0,.42,.96)),
  SL('hair_front','hairFront',A('default','hair_front',0,0,0,.5,0)),
  SL('arm_near','armNear',A('default','arm_near',0,0,-90,.5,.1)),
]
R = lambda *kv: [dict(time=t, value=v, curve='smooth') for t, v in kv]
T = lambda *kv: [dict(time=t, x=x, y=y, curve='smooth') for t, x, y in kv]
anims = {
 'idle': dict(duration=1.8, loop=True, tracks={
   'body': dict(translate=T((0,0,0),(.9,0,1.2),(1.8,0,0))), 'head': dict(rotate=R((0,0),(.9,2.5),(1.8,0))),
   'armNear': dict(rotate=R((0,0),(.9,3),(1.8,0))), 'armFar': dict(rotate=R((0,0),(.9,-3),(1.8,0)))}),
 'walk': dict(duration=.8, loop=True, tracks={
   'legNear': dict(rotate=R((0,28),(.4,-28),(.8,28))), 'legFar': dict(rotate=R((0,-28),(.4,28),(.8,-28))),
   'armNear': dict(rotate=R((0,-28),(.4,28),(.8,-28))), 'armFar': dict(rotate=R((0,28),(.4,-28),(.8,28))),
   'body': dict(translate=T((0,0,0),(.2,0,-.9),(.4,0,0),(.6,0,-.9),(.8,0,0)), rotate=R((0,2),(.4,2),(.8,2))),
   'head': dict(rotate=R((0,-2),(.4,2),(.8,-2)))}),
 'wave': dict(duration=1.2, loop=True, tracks={
   'armNear': dict(rotate=R((0,0),(.25,-140),(.5,-115),(.75,-150),(1,-120),(1.2,0))),
   'head': dict(rotate=R((0,0),(.3,-3),(1,-3),(1.2,0)))})}
P = dict(format='rigger', version=1, name='boy', images=images, bones=bones, slots=slots, outfits={}, animations=anims)
json.dump(P, open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'boy.rigger.json'), 'w'))
print('ok', os.path.getsize(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'boy.rigger.json')))
