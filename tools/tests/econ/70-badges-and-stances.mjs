section('徽记与架势：首枚银徽、绑定装备、KO 解锁和升阶');
{
  T = nextNoon();
  const u = await newUser('loadouttest', { ink: 5000 });
  await econ(u.token, 'sync');
  const gift = await econ(u.token, 'badgeGift', { id: 'focus' });
  ok(gift.res.ok && stateOf(u.uid).badgeOwned.focus === 'silver', '玩家可从选择中领取一枚银徽', gift.res);
  const repeatedGift = await econ(u.token, 'badgeGift', { id: 'flowing' });
  ok(repeatedGift.res.err && !stateOf(u.uid).badgeOwned.flowing, '银徽赠礼只能领取一次', repeatedGift.res);
  const badGift = await econ(u.token, 'badgeGift', { id: '__proto__' });
  ok(badGift.res.err, '不存在的徽记不能领取');
  const locked = await econ(u.token, 'stanceSet', { hero: 'qingfeng', stance: 1 });
  ok(locked.res.err, '未满 20 斩不能装备第二架势');
  const practice = await econ(u.token, 'matchStart', { mode: 'train' });
  ok(practice.res.err && stateOf(u.uid).heroKOs.qingfeng === undefined, '训练场不发起可计入架势进度的云端对局');
  const replay = await econ(u.token, 'matchStart', { mode: 'replay' });
  ok(replay.res.err && stateOf(u.uid).heroKOs.qingfeng === undefined, '回放模式不能发起可计入架势进度的云端对局');
  await econ(u.token, 'matchStart', { mode: 'cpu' }); T += 21000;
  const wrongMode = await econ(u.token, 'matchEnd', { ctx: { mode: 'net', level: '', char: 'qingfeng', ko: { qingfeng: 12 } } });
  ok(wrongMode.res.err && stateOf(u.uid).heroKOs.qingfeng === undefined, '结算模式必须与服务器记录的开局模式一致'); T += 16000;
  const equipped = await econ(u.token, 'badgeEquip', { hero: 'qingfeng', id: 'focus' });
  const moved = await econ(u.token, 'badgeEquip', { hero: 'feiying', id: 'focus' });
  ok(equipped.res.ok && moved.res.ok && !stateOf(u.uid).badgeEquip.qingfeng && stateOf(u.uid).badgeEquip.feiying === 'focus', '同一枚徽记可换侠客装备，且同一时间只装备一人', stateOf(u.uid).badgeEquip);
  for (let i = 0; i < 10; i++) {
    await econ(u.token, 'matchStart', { mode: 'cpu' }); T += 21000;
    const r = await econ(u.token, 'matchEnd', { ctx: { mode: 'cpu', level: 'hard', char: 'qingfeng', win: false, ko: { qingfeng: 12 } } });
    ok(r.res && r.res.ok, `完成第 ${i + 1} 场有效对局并记录 KO`, r.res);
    T += 16000;
  }
  let st = stateOf(u.uid);
  ok(st.heroKOs.qingfeng === 120 && st.badgeSigils === 3, '只累计已完成对局的可信范围内 KO，并按 40 斩发碎片', [st.heroKOs, st.badgeSigils]);
  const unlocked = await econ(u.token, 'stanceSet', { hero: 'qingfeng', stance: 1 });
  ok(unlocked.res.ok && stateOf(u.uid).stances.qingfeng === 1, '满 20 斩后可设置第二架势作为出战姿态');
  const upgraded = await econ(u.token, 'badgeUpgrade', { id: 'focus' });
  ok(upgraded.res.ok && stateOf(u.uid).badgeOwned.focus === 'gold' && stateOf(u.uid).badgeSigils === 0, '达到 KO 里程碑并支付碎片、墨锭后升为金徽', upgraded.res);
  const gated = await econ(u.token, 'badgeUpgrade', { id: 'focus' });
  ok(gated.res.err && stateOf(u.uid).badgeOwned.focus === 'gold', '紫金徽需要更高 KO 里程碑与碎片');
  const invalid = C.normalize({ ...C.blank(), badgeOwned: { focus: 'silver', '__proto__': 'gold' }, badgeEquip: { qingfeng: 'focus', feiying: 'focus' }, stances: { qingfeng: 1 }, heroKOs: { qingfeng: 19 } }, { now: T, uid: u.uid });
  ok(invalid.badgeEquip && Object.keys(invalid.badgeEquip).length <= 1 && invalid.stances.qingfeng !== 1, '存档校验会剔除重复装备与未解锁架势');
}
