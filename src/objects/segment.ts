/* eslint-disable @typescript-eslint/no-non-null-asserted-optional-chain */
import { TrackElementType } from '../utilities/trackElementType';
import { RideType } from '../utilities/rideType';
import * as finder from "../services/trackElementFinder"
import { debug } from '../utilities/logger';
import { doesSegmentHaveNextSegment } from '../services/trackElementFinder';

export type SegmentDescriptor = {
    location: CoordsXYZD;
    ride: number; // will log an error if you specify a ride # that doesn't exist
    trackType: TrackElementType; // e.g. TrackElementType.LeftBankedDown25ToDown25
    rideType: RideType;
};

export class Segment {
    private _location: CoordsXYZD;
    private _ride: number; // will log an error if you specify a ride # that doesn't exist
    private _trackType: TrackElementType; // e.g. TrackElementType.LeftBankedDown25ToDown25
    private _rideType: RideType;
    private _nextLocation: CoordsXYZD | null = null;
    private _previousLocation: CoordsXYZD | null = null;

    constructor(segment: SegmentDescriptor) {
        this._location = segment.location;
        this._ride = segment.ride;
        this._trackType = segment.trackType;
        this._rideType = segment.rideType;
    }


    public get(): SegmentDescriptor {
        return {
            location: this._location,
            ride: this._ride,
            trackType: this._trackType,
            rideType: this._rideType
        };
    }

    public nextLocation = (): CoordsXYZD | null => {
        if (this._nextLocation) {
            return this._nextLocation;
        }
        const thisTI = finder.getTIAtSegment(this);
        this._nextLocation = thisTI?.nextPosition || null;
        this._previousLocation = thisTI?.previousPosition || null;
        return this._nextLocation;
    };

    public previousLocation = (): CoordsXYZD | null => {
        if (this._previousLocation) {
            return this._previousLocation;
        }
        const thisTI = finder.getTIAtSegment(this);
        this._nextLocation = thisTI?.nextPosition || null;
        this._previousLocation = thisTI?.previousPosition || null;
        return this._previousLocation;
    };

    public isThereARealNextSegment = (direction: "next" | "previous"): boolean => {
        const thisTI = finder.getTIAtSegment(this);

        if (direction === "next") {
            const IsThereANextSegment = thisTI?.next(); // check if there's a next segment
            if ((IsThereANextSegment)) { // if there is, check if it's a ghost
                // ghosts will return false
                if (finder.getASpecificTrackElement(this._ride, thisTI?.position!).element.isGhost) return false;
            }
            return (IsThereANextSegment || false);
        }
        if (direction === "previous") {
            const IsThereAPreviousSegment = thisTI?.previous();
            if ((IsThereAPreviousSegment)) {
                if (finder.getASpecificTrackElement(this._ride, thisTI?.position!).element.isGhost) return false;
            }
            return IsThereAPreviousSegment || false;
        }
        return false;
    };
}
