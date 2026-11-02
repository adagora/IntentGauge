// Deliberate output corruption to prove the harness catches a refund regression.
// The CityWheels checkout is never edited.
import { target as actual } from './target.mjs';
export const target={...actual,name:actual.name+' / INJECTED REFUND REGRESSION',revision:actual.revision+'-injected-342',async execute(request,context){
 const output=await actual.execute(request,context);
 if(request.id==='cancel-cw-1002'){
  output.data.refund.refund_eur=342;
  output.answer=output.answer.replace('340 EUR','342 EUR');
  output.data.answerLower=output.answer.toLowerCase();
  output.data.injectedRegression=true;
 }
 return output;
}};
