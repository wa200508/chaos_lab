import {scalar} from './laws.js';

// A row represents a linear balance. Its right-hand side is a graph signal,
// so all solved unknowns retain references to the original random variables.
export function matrixRows(text){
  const rows=String(text).trim().split(/[;\n]/).map(row=>row.split(',').map(value=>value.trim()));
  if(rows.some(row=>row.length!==rows.length||row.some(value=>!value)))throw Error('Enter a square matrix, with commas between coefficients and semicolons between rows.');
  return rows;
}
export function solveBalances(matrix,rhs,factory){
  const a=matrix.map(row=>row.map(scalar)),values=[...rhs];
  const scale=(term,k)=>factory.apply('multiply',{x:term,b:factory.constant(k)});
  for(let col=0;col<a.length;col++){
    const pivot=a.findIndex((row,i)=>i>=col&&row[col]!=='0');
    if(pivot<0)throw Error('These balances do not determine a unique joint solution.');
    [a[col],a[pivot]]=[a[pivot],a[col]];
    [values[col],values[pivot]]=[values[pivot],values[col]];
    const divisor=a[col][col];
    a[col]=a[col].map(c=>scalar(`(${c})/(${divisor})`));
    values[col]=scale(values[col],`1/(${divisor})`);
    for(let row=0;row<a.length;row++){
      if(row===col||a[row][col]==='0')continue;
      const factor=a[row][col];
      a[row]=a[row].map((c,j)=>scalar(`(${c})-(${factor})*(${a[col][j]})`));
      values[row]=factory.apply('subtract',{x:values[row],b:scale(values[col],factor)});
    }
  }
  return values;
}
