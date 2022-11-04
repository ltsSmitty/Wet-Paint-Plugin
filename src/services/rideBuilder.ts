import { Flags } from './../utilities/Flags';
import { TrackElementType } from "../utilities/trackElementType";
import { RideType } from "../utilities/rideType";
import { debug } from "../utilities/logger";
import * as Selector from "../objects/segmentSelector";


let currentPreviewTrackType: TrackElementType | null = null;

export type TrackElementProps = {

    location: CoordsXYZD,
    ride: number, // will log an error if you specify a ride # that doesn't exist
    trackType: TrackElementType, // e.g. TrackElementType.LeftBankedDown25ToDown25
    rideType: RideType,
    brakeSpeed?: number,
    colour?: number,
    seatRotation?: number | null,
    trackPlaceFlags?: number, // the ghost flag is 104
    isFromTrackDesign?: boolean, // default is false
    flags?: number
};

type ConstructionProps = {
    referenceSegment: Selector.SegmentInfo,
    typeSegmentToBuild: TrackElementType | null,
    placement: "real" | "preview"
}

export const buildOrRemoveTrackElement = (trackProps: TrackElementProps, action: "build" | "remove", callback?: (result: GameActionResult) => void): void => {
    // debug(`TrackElementProps.location.z:  \n[     ${trackProps.location.z}      ]\n`)
    const gameActionEvent = (action === "build" ? "trackplace" : "trackremove");
    toggleRideBuildingCheats(true);
    const copyOfTrackProps = { ...trackProps };

    // eslint-disable-next-line prefer-const
    let { location: buildLocation, trackType, brakeSpeed, colour, seatRotation, trackPlaceFlags, isFromTrackDesign, flags, ...mainProps } = copyOfTrackProps;

    (brakeSpeed ? brakeSpeed : brakeSpeed = 0);
    (colour ? colour : colour = 0);
    (seatRotation ? seatRotation : seatRotation = 4);
    (trackPlaceFlags ? trackPlaceFlags : trackPlaceFlags = 0);
    (isFromTrackDesign ? isFromTrackDesign : isFromTrackDesign = false);
    // ghost flag is 104
    (flags ? flags : flags = 0);


    // if the ride is has a negative slope (e.g. Down25),
    // then it actually is stored with startZ of 16 and endZ of 0.
    // This function will change it to make it  0 and -16
    const zModifier = normalizeBeginAndEndZValues(trackType);
    // debug(`zModifier: ${zModifier.beginZ}, ${zModifier.endZ}`);
    buildLocation.z = buildLocation.z + zModifier.beginZ
    // debug(`Tweaking the buildLocation.z: ${buildLocation.z} to handle the slope`);

    const gameActionParams = {
        ...mainProps,
        ...buildLocation,
        trackType,
        brakeSpeed,
        colour,
        seatRotation,
        trackPlaceFlags,
        isFromTrackDesign,
        flags
    };

    context.executeAction(gameActionEvent, gameActionParams, (result) => {
        // debug(`Build result: ${JSON.stringify(result)}`);
        toggleRideBuildingCheats(false);
        if (callback) return callback(result);
    });

    toggleRideBuildingCheats(false);
};

// TODOO check what the values were before toggling  and set them back to what they were so we're not turning off cheats the user wants to be on
const toggleRideBuildingCheats = (cheatsOn: boolean) => {

    // TODO refactor to use gameactions for network compatability
    // context.executeAction("setcheataction", ) // figure out what the args are
    cheats.buildInPauseMode = cheatsOn;
    cheats.allowArbitraryRideTypeChanges = cheatsOn;

};


const getSegmentBeginAndEndZ = (segmentType: TrackElementType | number) => {
    const thisSegment = context.getTrackSegment(segmentType);
    if (!thisSegment) return { beginZ: 0, endZ: 0 };
    return {
        beginZ: thisSegment.beginZ,
        endZ: thisSegment.endZ
    }
}

// if the ride is has a negative slope (e.g. Down25),
// then it actually is stored with startZ of 16 and endZ of 0.
// This function will change it to make it start at  0 and end at -16.
// Necessary for proper build placement.
const normalizeBeginAndEndZValues = (segmentType: TrackElementType): { beginZ: number, endZ: number } => {
    const thisSegment = getSegmentBeginAndEndZ(segmentType);

    if (thisSegment.beginZ > 0) {
        debug(`This ride is probably pointing down; beginZ is ${thisSegment.beginZ}`);
        return {
            beginZ: 0 - thisSegment.beginZ,
            endZ: 0
        };
    }
    else {
        return thisSegment;
    }
};
