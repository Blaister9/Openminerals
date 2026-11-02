import type {GoldBarMesh,Vec3} from './gold-bar-3d.ts';

// The original casting's broad cap triangles give a boxy mineral silhouette.
// One static subdivision adds curvature samples for the scroll-driven morph,
// while retaining the exact casting surface and its interpolated bevel normals.
export function subdivideSpecimen(mesh:GoldBarMesh):GoldBarMesh {
 const positions:number[]=[],normals:number[]=[];
 const point=(data:Float32Array,at:number):Vec3=>[data[at],data[at+1],data[at+2]];
 const middle=(a:Vec3,b:Vec3):Vec3=>[(a[0]+b[0])/2,(a[1]+b[1])/2,(a[2]+b[2])/2];
 const unit=(a:Vec3):Vec3=>{const length=Math.hypot(...a);return [a[0]/length,a[1]/length,a[2]/length];};
 const triangle=(p:Vec3[],n:Vec3[])=>{for(let i=0;i<3;i++){positions.push(...p[i]);normals.push(...n[i]);}};
 for(let at=0;at<mesh.positions.length;at+=9){const a=point(mesh.positions,at),b=point(mesh.positions,at+3),c=point(mesh.positions,at+6),na=point(mesh.normals,at),nb=point(mesh.normals,at+3),nc=point(mesh.normals,at+6),ab=middle(a,b),bc=middle(b,c),ca=middle(c,a),nab=unit(middle(na,nb)),nbc=unit(middle(nb,nc)),nca=unit(middle(nc,na));triangle([a,ab,ca],[na,nab,nca]);triangle([ab,b,bc],[nab,nb,nbc]);triangle([ca,bc,c],[nca,nbc,nc]);triangle([ab,bc,ca],[nab,nbc,nca]);}
 return {positions:new Float32Array(positions),normals:new Float32Array(normals),vertexCount:positions.length/3,triangleCount:positions.length/9};
}
