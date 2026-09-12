/**
 * Coordinates for Z242OFPMBv2.0.pdf. PDF coordinates use the lower-left
 * origin. Keeping all template measurements here makes visual calibration
 * independent from the semantic PDF model and renderer.
 */
export interface OfpPoint { readonly x: number; readonly y: number; }
export interface OfpBox extends OfpPoint { readonly width: number; readonly height?: number; }

const navlogColumnBoundaries = [28, 93, 121.5, 149.5, 178, 206, 243, 270.5, 299.5, 327.5, 355, 381.5, 409, 470, 494.5, 519, 544.5, 570, 595, 619, 643, 667, 691, 715, 739, 774];
const navlogColumns = navlogColumnBoundaries.slice(0, -1).map((left, index) => ({
  x: left! + (navlogColumnBoundaries[index + 1]! - left!) / 2,
  width: navlogColumnBoundaries[index + 1]! - left! - 2,
}));

export const OFP_TEMPLATE_LAYOUT = {
  page1: {
    navlog: {
      rowLimit: 16,
      rowY: Array.from({ length: 16 }, (_, index) => 528 - index * 16.7),
      totalY: 260,
      alternateY: 244,
      alternateTotalY: 227,
      columns: navlogColumns,
    },
    departure: { x: 519, y: 584, width: 46 },
    destination: { x: 519, y: 572, width: 46 },
    date: { x: 105, y: 212, width: 82 },
    registration: { x: 105, y: 180, width: 82 },
  },
  page2: {
    registration: { x: 78, y: 547, width: 44 },
    weightBalance: {
      massX: 164, armX: 228, momentX: 292,
      rowsY: [532, 517, 503, 489, 461, 446, 432, 418, 404, 390],
    },
    fuelRequirements: {
      litresX: 513, kilogramsX: 575, timeX: 640,
      rowsY: [532, 517, 503, 489, 475, 460, 447],
    },
    cruise: { altitudeX: 359, oatX: 392, rpmX: 427, manifoldPressureX: 461, tasX: 495, fuelFlowX: 530, y: 390 },
    departureAerodrome: { name: { x: 462, y: 363, width: 30 }, runway: { x: 393, y: 349, width: 30 }, elevation: { x: 462, y: 349, width: 30 }, wind: { x: 393, y: 335, width: 30 }, crosswind: { x: 462, y: 335, width: 30 }, pressureAltitude: { x: 531, y: 335, width: 30 }, qnh: { x: 393, y: 321, width: 30 }, temperature: { x: 462, y: 321, width: 30 }, densityAltitude: { x: 531, y: 321, width: 30 } },
    destinationAerodrome: { name: { x: 691, y: 363, width: 30 }, runway: { x: 622, y: 349, width: 30 }, elevation: { x: 691, y: 349, width: 30 }, wind: { x: 622, y: 335, width: 30 }, crosswind: { x: 691, y: 335, width: 30 }, pressureAltitude: { x: 760, y: 335, width: 30 }, qnh: { x: 622, y: 321, width: 30 }, temperature: { x: 691, y: 321, width: 30 }, densityAltitude: { x: 760, y: 321, width: 30 } },
    crosswindLimit: { departure: { x: 725, y: 445, width: 28 }, destination: { x: 761, y: 445, width: 28 } },
    minimumFlight: { time: { x: 731, y: 389, width: 32 }, fuel: { x: 770, y: 389, width: 28 } },
    takeoffWorksheet: { uncorrectedDistance: { x: 531, y: 292, width: 30 }, headwind: { x: 384, y: 278, width: 14 }, runwayState: { x: 393, y: 264, width: 28 }, rcc: { x: 462, y: 264, width: 28 }, correction: { x: 531, y: 264, width: 28 }, correctedDistance: { x: 531, y: 195, width: 30 }, requiredDistance: { x: 531, y: 181, width: 30 }, availableDistance: { x: 531, y: 167, width: 30 } },
    landingWorksheet: { uncorrectedDistance: { x: 759, y: 292, width: 30 }, headwind: { x: 613, y: 278, width: 14 }, runwayState: { x: 622, y: 264, width: 28 }, rcc: { x: 691, y: 264, width: 28 }, correction: { x: 759, y: 264, width: 28 }, correctedDistance: { x: 759, y: 195, width: 30 }, requiredDistance: { x: 759, y: 181, width: 30 }, availableDistance: { x: 759, y: 167, width: 30 } },
    date: { x: 365, y: 22, width: 55 },
  },
} as const;

export const OFP_NAVLOG_COLUMN = {
  from: 0, tas: 1, trueTrack: 2, variation: 3, magneticTrack: 4,
  wind: 5, windCorrection: 6, accumulatedDistance: 7, accumulatedTime: 8,
  fuelFlow: 9, intermediateFuel: 10, accumulatedFuel: 11, to: 12,
  msa: 13, plannedAltitude: 14, magneticHeading: 15, groundSpeed: 16,
  intermediateDistance: 17, intermediateTime: 18, estimatedTime: 19,
  actualTime: 20, difference: 21, estimatedFuelRemaining: 22,
  actualFuelRemaining: 23, frequency: 24,
} as const;
