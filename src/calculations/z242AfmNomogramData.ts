export interface Z242AfmNomogramData {
  readonly id:
    | 'z242l-afm-fig-5-10-v1'
    | 'z242l-afm-fig-5-26-hot-brakes-v1';
  readonly source: string;
  readonly chartBounds: {
    readonly pressureAltitudeFt: readonly [number, number];
    readonly temperatureC: readonly [number, number];
    readonly massKg: readonly [number, number];
    readonly distanceM: readonly [number, number];
  };
  readonly temperatureAxis: {
    readonly valuesC: readonly number[];
    readonly x: readonly number[];
  };
  readonly pressureAltitudeLines: readonly {
    readonly pressureAltitudeFt: number;
    readonly slope: number;
    readonly intercept: number;
  }[];
  readonly distanceAxis: {
    readonly valuesM: readonly number[];
    readonly y: readonly number[];
  };
  readonly massAxis: {
    readonly valuesKg: readonly number[];
    readonly x: readonly number[];
  };
  readonly weightPanelReferenceX: number;
  readonly weightGuideLines: readonly {
    readonly entryY: number;
    readonly slope: number;
  }[];
}

/**
 * Reviewed numeric geometry copied from z242_afm_digitization_v1.json.
 * These are nomogram coordinates, not a regression or polynomial model.
 */
export const Z242_TAKEOFF_FIGURE_5_10: Z242AfmNomogramData = {
  id: 'z242l-afm-fig-5-10-v1',
  source: 'ZLIN Z242L AFM Figure 5-10 — take-off distance to 50 ft (15 m)',
  chartBounds: {
    pressureAltitudeFt: [0, 12000],
    temperatureC: [-60, 50],
    massKg: [800, 1100],
    distanceM: [400, 1600],
  },
  temperatureAxis: {
    valuesC: [-60, -50, -40, -30, -20, -10, 0, 10, 20, 30, 40, 50],
    x: [50, 136, 224, 321, 414, 502, 592, 678, 772, 868, 955, 1040],
  },
  pressureAltitudeLines: [
    { pressureAltitudeFt: 0, slope: -0.4272367038843688, intercept: 1338.6247043445896 },
    { pressureAltitudeFt: 3000, slope: -0.5211924003113569, intercept: 1257.285038491801 },
    { pressureAltitudeFt: 6000, slope: -0.613134439436066, intercept: 1135.1582694926558 },
    { pressureAltitudeFt: 9000, slope: -0.7717016164592565, intercept: 1006.0773809702947 },
    { pressureAltitudeFt: 12000, slope: -0.8908790708548682, intercept: 801.5312035787105 },
  ],
  distanceAxis: {
    valuesM: [1600, 1500, 1400, 1300, 1200, 1100, 1000, 900, 800, 700, 600, 500, 400],
    y: [41, 139, 229, 325, 420, 519, 610, 703, 799, 895, 990, 1085, 1178],
  },
  massAxis: {
    valuesKg: [800, 850, 900, 950, 1000, 1050, 1100],
    x: [1767.2128454443998, 1660.288648284675, 1554.2060547216, 1448.3841688728, 1330.0075684019998, 1211.5520969398003, 1096.9117206036],
  },
  weightPanelReferenceX: 1111,
  weightGuideLines: [
    { entryY: 80.99911253765254, slope: 1.0471410352267612 },
    { entryY: 367.65847573445114, slope: 0.8178634486353479 },
    { entryY: 579.4755292432872, slope: 0.6814525188127871 },
    { entryY: 748.7754436899944, slope: 0.57854549165814 },
    { entryY: 901.3691386408318, slope: 0.4561667585546498 },
    { entryY: 1033.8939271307595, slope: 0.42820164290417273 },
  ],
};

/** Figure 5-26 Hot brakes. Figure 5-25 is intentionally not represented. */
export const Z242_LANDING_FIGURE_5_26_HOT_BRAKES: Z242AfmNomogramData = {
  id: 'z242l-afm-fig-5-26-hot-brakes-v1',
  source: 'ZLIN Z242L AFM Figure 5-26 — landing distance from 50 ft (15 m), Hot brakes',
  chartBounds: {
    pressureAltitudeFt: [0, 12000],
    temperatureC: [-50, 50],
    massKg: [850, 1050],
    distanceM: [400, 900],
  },
  temperatureAxis: {
    valuesC: [-50, -40, -30, -20, -10, 0, 10, 20, 30, 40, 50],
    x: [120, 232, 346, 462, 582, 694, 810, 924, 1040, 1154, 1265],
  },
  pressureAltitudeLines: [
    { pressureAltitudeFt: 0, slope: -0.398601346684674, intercept: 1613.57658397988 },
    { pressureAltitudeFt: 3000, slope: -0.4449017501031234, intercept: 1492.9038275242065 },
    { pressureAltitudeFt: 6000, slope: -0.4908095130429688, intercept: 1346.086181080957 },
    { pressureAltitudeFt: 9000, slope: -0.5311121618058087, intercept: 1179.895368678358 },
    { pressureAltitudeFt: 12000, slope: -0.6175487731348597, intercept: 1009.0820418449068 },
  ],
  distanceAxis: {
    valuesM: [900, 850, 800, 750, 700, 650, 600, 550, 500, 450, 400],
    y: [430, 548, 667, 780, 890, 1002, 1119, 1237, 1353, 1471, 1580],
  },
  massAxis: {
    valuesKg: [850, 900, 950, 1000, 1050],
    x: [2042, 1901, 1757, 1618, 1469],
  },
  weightPanelReferenceX: 1469,
  weightGuideLines: [
    { entryY: 657.2022687144519, slope: 0.6027402739512262 },
    { entryY: 830.6405612306488, slope: 0.5545502073799964 },
    { entryY: 984.1790841328552, slope: 0.52223795981656 },
    { entryY: 1133.6743286438707, slope: 0.4614932440434734 },
    { entryY: 1262.0987888710554, slope: 0.41485487394888915 },
  ],
};
