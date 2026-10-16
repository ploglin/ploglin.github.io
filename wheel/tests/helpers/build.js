// 測試用：快速組出活動
import { createEvent, createParticipant, createPrize } from '../../core/model.js';
import { fakeNames } from '../fixtures/make-fixtures.js';

export function makeEvent({ people = 10, groups = null, prizes = [], scenario = 'banquet' } = {}) {
  const ev = createEvent({ name: '測試活動', scenario });
  const names = fakeNames(people, 99);
  names.forEach((n, i) => ev.participants.push(createParticipant({ name: n, group: groups ? groups[i % groups.length] : undefined })));
  prizes.forEach((p, i) => ev.prizes.push(createPrize(p, i + 1)));
  ev.settings.rules.absentKeepsEligibility = true;
  return ev;
}

export function prizeNamed(ev, name) { return ev.prizes.find(p => p.name === name); }
