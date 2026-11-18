'use strict';
function bostonPickupTime(localDate,localTime){
  // Resolve Boston wall-clock time using America/New_York, including daylight saving.
  // Reject nonexistent spring-forward times rather than silently shifting a pickup.
  const parts=/^(\d{4})-(\d{2})-(\d{2})$/.exec(localDate);
  const clock=/^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(localTime);
  if(!parts||!clock)throw RangeError('Invalid pickup time');
  const y=Number(parts[1]),m=Number(parts[2]),d=Number(parts[3]);
  const hh=Number(clock[1]),mm=Number(clock[2]),ss=Number(clock[3]||0);
  const wall=Date.UTC(y,m-1,d,hh,mm,ss);
  const fmt=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',hourCycle:'h23',
    year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit'});
  const matches=[];
  for(const hours of [4,5]){
    const candidate=new Date(wall+hours*3600000);
    const fields=Object.fromEntries(fmt.formatToParts(candidate).filter(p=>p.type!=='literal').map(p=>[p.type,Number(p.value)]));
    if(fields.year===y&&fields.month===m&&fields.day===d&&fields.hour===hh&&fields.minute===mm&&fields.second===ss)
      matches.push(candidate);
  }
  if(matches.length!==1)throw RangeError('Invalid, nonexistent or ambiguous Boston pickup time');
  return matches[0];
}
module.exports = { bostonPickupTime };
