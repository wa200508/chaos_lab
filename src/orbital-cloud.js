// For an isotropic Gamma(3, λ) radius, dividing its radial PDF by 4πr²
// gives ρ(r) = λ³ exp(−λr)/(8π). The renderer uses lengths in Bohr radii.
import {sampleFinalDistribution} from './visualization.js';

export function cloudRate(law, rendered) {
  const term = law?.term;
  if (term?.family !== 'gamma' || term.parameters.shape !== '3' || rendered?.status !== 'ready') return null;
  return 3 / rendered.stats.mean;
}

export function positions(rendered, count, seed) {
  const radii = sampleFinalDistribution(rendered, count, seed);
  let state = (seed ^ 0x9e3779b9) >>> 0;
  function uniform() {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    return (state + 0.5) / 4294967296;
  }
  return radii.map(r => {
    const cosine = 2 * uniform() - 1;
    const angle = 2 * Math.PI * uniform();
    const transverse = r * Math.sqrt(1 - cosine * cosine);
    return [transverse * Math.cos(angle), transverse * Math.sin(angle), r * cosine];
  });
}

const colors = [[6,10,23], [20,22,56], [51,38,109], [96,67,172], [90,144,211], [130,219,231], [237,250,234]];
function color(value) {
  const t = Math.max(0, Math.min(1, value)) * (colors.length - 1);
  const i = Math.min(colors.length - 2, Math.floor(t));
  return colors[i].map((v,c) => Math.round(v + (colors[i+1][c]-v)*(t-i)));
}
const palette = Array.from({length:256}, (_,i)=>color(i/255));

export function drawOrbital(canvas, {rate, points, extent, view, density}) {
  const size = canvas.width, center = size / 2, scale = center / extent;
  const ctx = canvas.getContext('2d');
  const counts = new Float32Array(size * size);
  if (view === 'cloud') {
    // Splat individual detections across nearby pixels. Keep the kernel width
    // constant in physical units across export and thumbnail resolutions.
    const sigma = Math.max(0.7, scale * 0.032);
    const radius = Math.ceil(2.8 * sigma);
    const weights = Array.from({length:2*radius+1}, (_,i)=>Math.exp(-0.5*((i-radius)/sigma)**2));
    for (const [x,y] of points) {
      const col = Math.round(center + scale*x), row = Math.round(center - scale*y);
      for (let j=Math.max(0,row-radius);j<=Math.min(size-1,row+radius);j++) {
        const wy = weights[j-row+radius];
        for (let i=Math.max(0,col-radius);i<=Math.min(size-1,col+radius);i++)
          counts[j*size+i] += wy * weights[i-col+radius];
      }
    }
  }
  if(view==='slice' && density) {
    for(let row=0;row<size;row++) for(let col=0;col<size;col++)
      counts[row*size+col]=density((col+.5-center)/scale,(center-row-.5)/scale);
  }
  let peak = 0;
  for (const value of counts) peak=Math.max(peak,value);
  const image = ctx.createImageData(size,size);
  for (let row=0;row<size;row++) for (let col=0;col<size;col++) {
    const i=row*size+col;
    const fraction = view==='slice' && !density
      ? Math.exp(-rate*Math.hypot((col+.5-center)/scale,(row+.5-center)/scale))
      : counts[i]/(peak || 1);
    const rgb=palette[Math.round(255*Math.sqrt(fraction))];
    image.data.set(rgb,4*i); image.data[4*i+3]=255;
  }
  ctx.putImageData(image,0,0);
  const unit=size/512;
  ctx.save();ctx.scale(unit,unit);ctx.strokeStyle='#efdfb0';ctx.lineWidth=1;
  ctx.beginPath();ctx.arc(256,256,3.5,0,2*Math.PI);ctx.stroke();
  const bar=256/extent;
  ctx.strokeStyle='#c9dae5';ctx.beginPath();ctx.moveTo(22,480);ctx.lineTo(22+bar,480);ctx.stroke();
  ctx.fillStyle='#d4e1eb';ctx.font='13px sans-serif';ctx.fillText('1 a₀',22,470);ctx.restore();
}
