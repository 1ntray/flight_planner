import type { AeronauticalSourceReference } from './aeronautical';

export type CommunicationServiceType =
  | 'atis'
  | 'clearance-delivery'
  | 'ground'
  | 'tower'
  | 'approach'
  | 'afis'
  | 'flight-information'
  | 'area-control'
  | 'other';

export interface AtsUnit {
  readonly id: string;
  readonly publishedName: string;
  readonly sourceReferences: readonly AeronauticalSourceReference[];
}

export interface CommunicationFrequencyAssignment {
  /** Exact published decimal representation, avoiding binary-float changes. */
  readonly valueMHz: string;
  readonly hours?: string;
  readonly remarks?: string;
  /** Explicitly published planning applicability; absent means unspecified. */
  readonly planningUse?: 'primary' | 'vfr' | 'ifr-only' | 'contingency';
}

export interface CommunicationAssociation {
  readonly featureId: string;
  readonly featureKind: 'aerodrome' | 'airspace';
  readonly basis: 'explicit' | 'unique-source-callsign-match';
}

export interface CommunicationService {
  readonly id: string;
  readonly serviceType: CommunicationServiceType;
  readonly publishedServiceType: string;
  readonly unitId?: string;
  readonly callsign?: string;
  readonly frequencies: readonly CommunicationFrequencyAssignment[];
  readonly associations: readonly CommunicationAssociation[];
  readonly remarks?: string;
  readonly sourceReferences: readonly AeronauticalSourceReference[];
}
