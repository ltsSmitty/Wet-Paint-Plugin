
import { TileElementItem, TrackElementItem } from './SegmentController';
import { debug } from "../utilities/logger";
import { Segment } from '../objects/segment';
import { TrackElementType } from '../utilities/trackElementType';


/**
 * Utility function to get a specific type of TileElement at a given CoordsXY
 * @returns
 */
export const getTileElements = <T extends TileElement>(elementType: TileElementType, coords: CoordsXY): TileElementItem<T>[] => {
    // debug(`Querying tile for ${elementType} elements at coords (${coords.x}, ${coords.y})`);

    // have to divide the mapCoords by 32 to get the tile coords
    const selectedTile = map.getTile(coords.x / 32, coords.y / 32);

    // filter and map to elements of the given type
    const reducedELements = selectedTile.elements.reduce<TileElementItem<T>[]>((filtered, el, index) => {
        if (el.type === elementType) {
            return filtered.concat({
                element: <T>el,
                index: index,
                coords
            });
        }
        return filtered;
    }, []);

    // debug(`Query returned ${reducedELements.length} elements`);
    return reducedELements;
};
/**
 * Utility function to get all "surface" elements at a given coords.
 */
export const getSurfaceElementsFromCoords = (coords: CoordsXY | CoordsXYZ | CoordsXYZD) => {
    return getTileElements<SurfaceElement>("surface", { x: coords.x, y: coords.y });
};

/**
 * Get the robust TrackElementItems for a given coords.
 */
export const getTrackElementsFromCoords = (coords: CoordsXY): TrackElementItem[] => {
    // get all the track tile elements at coords
    const potentialTrackElements = getTileElements<TrackElement>("track", coords);
    // filter out the stalls since we don't care about those
    const trackElementsWithoutStalls = potentialTrackElements.filter(t => !isRideAStall(t.element.ride));
    // get the segment for each track element
    const theseTrackEementsWithSegments = trackElementsWithoutStalls.map(e => {
        const thisSegment = getSegmentFromTrackElement(e);
        return {
            ...e,
            segment: thisSegment
        };
    });
    return theseTrackEementsWithSegments;
};


/**
 * Utility to get the segment data at a TileElementItem.
 */
const getSegmentFromTrackElement = (e: TileElementItem<TrackElement>): Segment | null => {
    const tempTI = map.getTrackIterator(e.coords, e.index);
    if (!tempTI) {
        debug(`Unable to get trackIterator for coords (${e.coords.x}, ${e.coords.y})`);
        return null;
    }
    if (!tempTI.segment) {
        debug(`Unable to get segment for coords (${e.coords.x}, ${e.coords.y})`);
        return null;
    }
    return new Segment({
        location: tempTI.position,
        trackType: tempTI.segment.type,
        rideType: e.element.rideType,
        ride: e.element.ride
    });
};


/**
 * @summary Returns an array of relative coords of the track elements for the segment.
 * @description E.g. for a large left turn, it returns 7 relatively spaced coords (for the seven tiles it covers)) that go from (0,0) to (+/-64,+/-64) depending on how the segment is rotated.
 */
const getRelativeElementCoordsUnderSegment = (segment: Segment): TrackSegmentElement[] | null => {
    // get the element index of this segment in order to
    const thisTI = getTIAtSegment(segment)
    const segmentElements = thisTI?.segment?.elements;
    if (!segmentElements) return null;
    return segmentElements;
};

/**
 * @summary Get all TrackElementItems for a given segment. Use to get all elements of a multi-element segment (e.g. LeftQuarterTurn3Tiles, LeftQuarterTurn5Tiles, etc.). Useful for painting each element of the segment.
 * @description E.g. for a large left turn, there are 7 elements  with relatively spaced coords (for the seven tiles it covers) that go from (0,0) to (+/-64,+/-64) depending on how the segment is rotated. Convert those coords to absolute positioning.
 *
 * @returns the TrackElementItems with their absolute position the element, e.g. (1248, 1984)
 */
export const getAllSegmentTrackElements = (segment: Segment | null): TrackElementItem[] => {
    if (segment == null) {
        return [];
    }

    const segmentElements = getRelativeElementCoordsUnderSegment(segment);

    if (!segmentElements) {
        debug(`Error: somehow this segment has no elements`);
        return [];
    }

    const coords = segment.get().location;
    const x1 = coords.x;
    const y1 = coords.y;
    const z1 = coords.z;

    // get the proper position based on the direction of the segment and the element
    const exactCoordsUnderSegment = segmentElements.map((segmentElement) => {
        switch (coords.direction) {
            case 0: {
                return {
                    x: x1 + segmentElement.x,
                    y: y1 + segmentElement.y,
                    // z: z1 - segmentElement.z
                    z: z1
                };
            }
            case 1: {
                return {
                    x: x1 + segmentElement.y,
                    y: y1 - segmentElement.x,
                    // z: z1 - segmentElement.z
                    z: z1
                };
            }
            case 2: {
                return {
                    x: x1 - segmentElement.x,
                    y: y1 - segmentElement.y,
                    // z: z1 - segmentElement.z
                    z: z1
                };
            }
            case 3: {
                return {
                    x: x1 - segmentElement.y,
                    y: y1 + segmentElement.x,
                    // z: z1 - segmentElement.z
                    z: z1
                };
            }
        }
    })

    const allTheseElements = exactCoordsUnderSegment.map((coords) => {
        return getASpecificTrackElement(segment.get().ride, { ...coords, direction: segment.get().location.direction });
    });

    return allTheseElements;
}

/**
 * Get the TrackElementItem for a specific ride and given XYZD.
 * This may behave unexpectedly if collision checks are off and there are multiple segments at the same XYZD.
 * In that case, it will return the 0th element.
 */
export const getASpecificTrackElement = (ride: number, coords: CoordsXYZD): TrackElementItem => {
    const trackELementsOnTile = getTrackElementsFromCoords({ x: coords.x, y: coords.y });
    const trackForThisRide = trackELementsOnTile.filter(e => e.element.ride === ride);
    // debug(`Getting the track elements for ride ${ride} at location (${coords.x}, ${coords.y}, ${coords.z}) direction ${coords.direction}).
    //  ${trackForThisRide.length} elements exists for this ride at this (x,y).`);

    // if there are two segments for the same ride in this tile, make sure it's the proper one
    if (trackForThisRide.length > 1) {

        // comparing z is not as straightforward becauase it has to account for the height of down segments.
        const zModifiers = trackForThisRide.map(e => {
            const trackType = context.getTrackSegment(e.element.trackType);
            return trackType?.beginZ || 0; // the default value of 0 is just to clean up potential ugliness downstream.
        });

        // check each of the potential segments to see if it's the right one
        // this is complicated because the z value can be off by an amount depending on what track type was built.
        debug(`List of such elements:`)
        trackForThisRide.map((t, index) => {
            debug(`      Element ${index}: ${TrackElementType[t.element.trackType]} at (${t.segment?.get().location.x}, ${t.segment?.get().location.y}, ${t.segment?.get().location.z}), direction ${t.segment?.get().location.direction}, z modifier ${zModifiers[index]}`);
        });

        const chosenTrack = trackForThisRide.filter((t, index) => {
            const actualX = t.segment?.get().location.x;
            const actualY = t.segment?.get().location.y;
            const actualZ = t.segment?.get().location.z;
            const actualDirection = t.segment?.get().location.direction;

            const doesXMatch = actualX === coords.x;
            const doesYMatch = actualY === coords.y;
            const doesDirectionMatch = actualDirection === coords.direction;

            // const directionMod4 = actualDirection || 0 % 4;
            // const coordDirectionMod4 = coords.direction || 0 % 4;

            const doesZMatch: boolean = actualZ === coords.z;
            const areTheZsAdjustEqual = t.element.baseZ || 0 + zModifiers[index] === coords.z;
            const areTheZsSubtractEqual = t.element.baseZ || 0 - zModifiers[index] === coords.z;

            const doTheyAllMatch = doesXMatch && doesYMatch && doesZMatch && doesDirectionMatch;

            debug(`Actual (x,y,z,d) ?= expected (x,y,z,d):
            (${actualX}, ${actualY}, ${actualZ}, ${actualDirection})
            (${coords.x}, ${coords.y}, ${coords.z}, ${coords.direction})
            Do they all match? ${doTheyAllMatch}`);

            if (doTheyAllMatch) {
                debug(`Found the right track element!: Element ${TrackElementType[t.element.trackType]}`);
                return (doTheyAllMatch);
            }

            debug(`If not the exactZ, let's try a z-adjust`);
            const doesSomeZMatch = doesZMatch || areTheZsAdjustEqual || areTheZsSubtractEqual;

            debug(`is the zAdjust equal? ${areTheZsAdjustEqual}`);
            debug(`is the zSubtract equal? ${areTheZsSubtractEqual}`);

            // if x y and z match but not direction, maybe we check the element sequence.
            if (doesXMatch && doesYMatch && doesZMatch && !doesDirectionMatch) {
                debug(`x y and z match but not direction. Checking the element sequence: Sequence ${t.element.sequence}`);
                debug(`I'm going to return true on this, but the direction isn't right. This will maybe error out.`)
                return true;
            }
            debug(`Element ${index} is not the right one.`);
            return false;
        });
        if (chosenTrack.length === 0) {
            debug(`Error: No matching segments were found (but at least one should have been), so this is going to error out undefined downstream.
            `);
        }
        if (chosenTrack.length > 1) {
            debug(`Error: There are two overlapping elements at this tile with the same XYZD. They might be on a diagonal.
            Was looking for an element matched the coords: ${JSON.stringify(coords)}`);

            chosenTrack.map((segment, index) => {
                debug(`Element ${index}: ${TrackElementType[segment.element.trackType]} at (${segment.segment?.get().location.x}, ${segment.segment?.get().location.y}, ${segment.segment?.get().location.z}), direction ${segment.segment?.get().location.direction}`);
            });
        }
        return chosenTrack[0];
    }
    return trackForThisRide[0];
};

// /**
//  * For a given segment, return whether or not a next segment exists and if so, what it is.
//  */
// export const doesSegmentHaveNextSegment = (selectedSegment: Segment | null, selectedBuild: TrackElementType): { exists: false | "ghost" | "real", element: TrackElementItem | null } => {

//     if (selectedSegment == null || selectedSegment.nextLocation() == null) {
//         debug(`${selectedSegment == null ? "selectedSegment is null" : "selectedSegment.nextLocation() is null"}`);
//         return { exists: false, element: null };
//     }

//     const isThereANextSegment = selectedSegment.isThereARealNextSegment("next");
//     debug(` TEST: Instead of using this convoluted system, why not use a TI?`)
//     debug(`isThereANextSegment: ${isThereANextSegment}`);

//     // const thisTI = getTIAtSegment(selectedSegment);

//     // todo maybe this could be wrong, but probably not. maybe if a new track was build above an old one the index could get messed up?

//     const { x, y, z, direction } = selectedSegment.nextLocation()!; // location of next track element
//     const trackELementsOnNextTile = getTrackElementsFromCoords({ x, y });

//     if (trackELementsOnNextTile.length === 0) {
//         debug(`No track elements on next tile`);
//         return { exists: false, element: null };
//     }

//     // make sure the ride matches this ride
//     const trackForThisRide = trackELementsOnNextTile.filter(e => e.element.ride === selectedSegment.get().ride);
//     debug(`There are ${trackForThisRide.length} track elements for this ride on the next tile.`);

//     const nextTracksWhichMatchDirectionAndZ = trackForThisRide.filter(t => {
//         // t is a track element that already exists on the tile in question. it may has a different z and direction than the one we're trying to place
//         const trackSegment = t.segment?.get();
//         const selectedSegmentBaseZ = context.getTrackSegment(trackSegment?.trackType || 0)?.beginZ || 0;

//         // todo this might be where a % might be needed.
//         debug(`Existing track piece.baseZ + selectedSegmentBaseZ = ${t.element.baseZ} + ${selectedSegmentBaseZ} = ${t.element.baseZ + selectedSegmentBaseZ}`);
//         debug(`Existing track piece baseZ - selectedSegmentBaseZ = ${t.element.baseZ} - ${selectedSegmentBaseZ} = ${t.element.baseZ - selectedSegmentBaseZ}`);
//         debug(`Existing track piece baseZ = z: ${t.element.baseZ} ?= ${z}`);
//         debug(`Non-adjusted trackSegment direction: ${t.element.direction} ?= ${direction}`);
//         return (t.element.direction === direction && (t.element.baseZ + selectedSegmentBaseZ === z || t.element.baseZ - selectedSegmentBaseZ === z || t.element.baseZ === z));
//     });

//     // const isThereActuallyASegmentToDelete = (selectedSegment: Segment | null, existingConflictingSegment: Segment | null) => {

//     //     if (selectedSegment == null || existingConflictingSegment == null) return false;

//     //     const nextLocation = selectedSegment.get().location;
//     //     const { x, y, z, direction } = nextLocation;
//     //     // get the z modifier that we need to check for.
//     //     // for example, if there's a track from the same ride with the same direction but the z is off by 25, is that a conflict?
//     //     // this checks for that. the most likely beginZ differences are with Down25, Down60 and the big DownToFlat on hypercoasters, etc.
//     //     const selectedBuildBeginZ = (context.getTrackSegment(selectedBuild)?.beginZ || 0);
//     //     debug(`Attempting to place ${TrackElementType[selectedBuild]} at z ${z} direction ${direction}. This element has a beginZ of ${selectedBuildBeginZ}`);
//     // }

//     let thisTrack: TrackElementItem;

//     // if there are two segments for the same ride in this tile, make sure it's the proper one
//     if (nextTracksWhichMatchDirectionAndZ.length === 0) {
//         debug(`There is a track at the next coords, but it doesn't match the proper z range and direction, so returning that there is no next track.`);
//         debug(`${trackForThisRide.map(t => ` baseZ: (${t.element.baseZ}, direction: ${t.element.direction})`)}`);

//         return { exists: false, element: null };
//     }

//     if (trackForThisRide.length > 1) {
//         debug(`There is more than one element at the next tile for this ride ${x},${y}`);
//         const chosenTrack = trackForThisRide.filter(t => t.element.baseZ === z);
//         thisTrack = chosenTrack[0];
//     } else { thisTrack = trackForThisRide[0]; }

//     if (!thisTrack?.element) {
//         debug(`I must have filtered too well and there are no track elements for this ride at the next tile.`);

//     }

//     if (thisTrack.element.isGhost) return { exists: "ghost", element: thisTrack };
//     return { exists: "real", element: thisTrack };
// };


/**
 * Since stalls are also considered rides, use this filter to check stall vs true ride
 *
 *
 * @param rideNumber  @returns true if stall, false if other kind of ride.
 */
const isRideAStall = (rideNumber: number): boolean => {
    return map.getRide(rideNumber)?.classification === "stall";
};


export const getTIAtSegment = (segment: Segment | null): TrackIterator | null => {
    if (segment == null) {
        debug(`segment was null`);
        return null;
    }
    debug(`Getting TI at the track element of ride ${segment.get().ride} at (${segment.get().location.x}, ${segment.get().location.y}, ${segment.get().location.z}) dir ${segment.get().location.direction}`);
    debug(`Looking for the indexOf the track element.`)
    const thisSegmentIndex = getASpecificTrackElement(segment.get().ride, segment.get().location).index; // needed for iterator
    const newTI = map.getTrackIterator(<CoordsXY>segment.get().location, thisSegmentIndex); // set up TI

    if (newTI == null) {
        debug(`There was an issue creating the track iterator to get next segment options.`);
        return null;
    }
    return newTI;
}

export const getTrackColours = (newSeg: Segment | null): TrackColour => {
    // ride.colourSchemes is one option, but i wonder if you can do better
    // TrackElement. colour scheme => look up
    if (newSeg == null) return { main: -1, additional: -1, supports: -1 };

    const thisSeg = getASpecificTrackElement(newSeg?.get().ride || 0, newSeg?.get().location);
    const thisColourScheme = thisSeg.element.colourScheme
    const theseTrackColours = map.getRide(newSeg.get().ride)?.colourSchemes[thisColourScheme || 0];
    return theseTrackColours;
};
