/* Физика корабля на плоскости воды: сам держит ход, руль при скорости срывает корму в занос, отпустили — корпус ловит воду обратно.
   Ход в заносе почти не теряется: вектор скорости лишь поворачивается к курсу с задержкой, а его величина держится у крейсерской. */
(function () {
  'use strict';
  M.newShipState = function (T) { var st = T.start; return { x: st.x, z: st.z, a: st.a, vx: Math.cos(st.a) * 6, vz: Math.sin(st.a) * 6, w: 0, sp: 6, slip: 0, idx: 6, s: 24, off: 0, drifting: false, stuckT: 0 }; };

  // input.steer: -1 влево, 1 вправо, 0 прямо. P: { cruise м/с, turn, grip, friction (лёд < 1) }
  M.stepShip = function (S, input, dt, P) {
    var steer = input.steer || 0, sp = Math.sqrt(S.vx * S.vx + S.vz * S.vz), dirV = sp > 1 ? Math.atan2(S.vz, S.vx) : S.a;
    var fast = sp > P.cruise * 0.45, drifting = steer !== 0 && fast;
    // руль: на ходу нос уходит в занос на 1,2 рад/с, на малом ходу мягче; без руля корпус флюгером встаёт за своей скоростью
    var eff = 0.35 + 0.65 * Math.min(1, sp / (P.cruise * 0.6));
    var wantW = steer * P.turn * (drifting ? 1.2 : 0.75) * eff;
    S.w += (wantW - S.w) * Math.min(1, 7 * dt);
    if (steer === 0 && sp > 3) S.w += M.angDiff(dirV, S.a) * 3.2 * dt;
    S.a += S.w * dt;
    // вектор скорости догоняет курс: в заносе медленно (на льду ещё медленнее), прямо — быстро. Угол заноса держится около 40°;
    // при перекруте нос подтягивается к вектору скорости, а ход не гасится
    var follow = (drifting ? 1.6 : 6) * P.friction * P.grip;
    dirV += M.angDiff(S.a, dirV) * Math.min(1, follow * dt);
    var slip = Math.abs(M.angDiff(S.a, dirV));
    if (slip > 1.0) S.a += M.angDiff(dirV, S.a) * Math.min(1, 5 * dt);
    // ход: величина скорости тянется к крейсерской, в глубоком заносе корпус чуть тормозит о воду (до 8 %).
    // Разгон растёт медленнее скорости (24 м/с — опорная скорость прежнего Мегалюля), поэтому после удара быстрый корабль набирает ход дольше
    var k = 0.4 + 0.6 * P.cruise / 24, target = P.cruise * (drifting ? 1 - 0.08 * M.smooth(slip) : 1), accel = (target > sp ? 6.5 : 2.5) * k;
    sp += M.clamp(target - sp, -accel * dt, accel * dt);
    S.vx = Math.cos(dirV) * sp; S.vz = Math.sin(dirV) * sp;
    S.x += S.vx * dt; S.z += S.vz * dt;
    S.sp = sp; S.slip = sp > 2 ? slip : 0; S.drifting = drifting && slip > 0.18;
    return S;
  };

  // Удар: вытолкнуть по нормали, отразить скорость, вернуть силу удара для урона.
  M.impact = function (S, nx, nz, depth) {
    S.x += nx * depth; S.z += nz * depth;
    var vn = S.vx * nx + S.vz * nz;
    if (vn >= 0) return 0;
    S.vx -= 1.5 * vn * nx; S.vz -= 1.5 * vn * nz; S.w *= 0.4;
    return -vn;
  };
})();
