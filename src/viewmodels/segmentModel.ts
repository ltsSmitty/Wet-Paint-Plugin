import { SegmentElementPainter } from './../objects/segmentElementPainter';
import { Segment } from './../objects/segment';
import * as highlighter from '../services/highlightGround';
import * as builder from './builderModel';
import * as finder from '../services/trackElementFinder';
import * as storage from '../utilities/coldStorage';

import { compute, Store, store } from 'openrct2-flexui';
import { getSuggestedNextSegment } from '../utilities/suggestedNextSegment';

import { debug } from '../utilities/logger';
import { TrackElementType } from '../utilities/trackElementType';
import { combinedLabelSpinner } from '../ui/utilityControls';


export class SegmentModel {

    readonly selectedSegment = store<Segment | null>(null);
    readonly selectedBuild = store<TrackElementType | null>(null);
    readonly previewSegment = store<Segment | null>(null);

    readonly buildableTrackTypes = store<TrackElementType[]>([]);
    readonly buildDirection = store<"next" | "prev" | null>("next");
    readonly buildRotation = store<Direction | null>(null);

    private segmentPainter = new SegmentElementPainter();

    constructor() {
        this.selectedSegment.subscribe((seg) => this.onSegmentChange(seg));
        this.buildDirection.subscribe((dir) => this.onBuildDirectionChange(dir));
        this.buildRotation.subscribe((rotation) => this.onRotationChange(rotation));
        this.buildableTrackTypes.subscribe((newbuildableTrackTypesList) => this.onbuildableTrackTypesChange(newbuildableTrackTypesList));
        this.selectedBuild.subscribe((newSelectedBuild) => this.onSelectedBuildChange(newSelectedBuild));
        this.previewSegment.subscribe((newPreviewSegment) => this.onPreviewSegmentChange(newPreviewSegment));

        // context.subscribe("action.execute", (event: GameActionEventArgs) => {
        //     const action = event.action as ActionType;
        //     switch (action) {
        //         case "ridesetappearance":
        //         case "ridesetcolourscheme": {
        //             debug(`<${action}>\n\t- type: ${event.type}
        // \t- args: ${JSON.stringify(
        //                 event.args, null, 2
        //             )}\n\t- result: ${JSON.stringify(event.result)}`);
        //             break;
        //         }
        //     }
        // })
    }

    /**
     * @summary Called upon plugin mount. If the game was saved without closing the window, some artifacts will remain, including the preview track,
     * the highlight under the preview track, and the yellow painting of the selected segment. This function will remove all of those artifacts.
     */
    cleanUpFromImproperClose(): void {
        // debug("cleaning up from improper close on pluginMount.");

        // if threre is still a previewSegment, call close to clean up
        const storedPaintedSegmentDetails = storage.getPaintedSegmentDetails();
        const storedPreviewSegment = storage.getPreviewSegment();
        if (storedPreviewSegment || storedPaintedSegmentDetails.segment) {
            // debug(`Upon plugin mount, there was still a preview segment or painted segment in storage. Cleaning up.`);
            this.previewSegment.set(storedPreviewSegment);
            this.close();
        }
    }

    close(): void {
        // debug("closing segment model");
        this.segmentPainter.restoreInitialColour();
        builder.removeTrackSegment(this.previewSegment.get());
        this.previewSegment.set(null);
        this.selectedSegment.set(null);
    }

    /**
     * Main function called by the Ui to construct the selected segment.
     */
    buildSelectedNextPiece() {
        const segToBuild = this.selectedBuild.get();
        if (segToBuild == null) {
            debug("no selected track type to build");
            return;
        }
        builder.removeTrackAtFollowingPosition(this.selectedSegment.get(), "next", "ghost", (result) => {
            debug(`Ghost removed from the next position of the selected segment. Result is ${JSON.stringify(result, null, 2)}`);
        });
        builder.buildTrackAtFollowingPosition(this.selectedSegment.get(), "next", segToBuild, "real", ({ result, newlyBuiltSegment }) => {
            // this.previewSegment.set(newlyBuiltSegment);
            if (result.error) {
                debug(`Error building that piece. ${result?.errorMessage}`);
                return;
            }
            debug(`Real track built.`);
        });
    }

    moveToNextSegment(direction: "next" | "prev") {
        const tiAtSelectedSegment = finder.getTIAtSegment(this.selectedSegment.get()); // use a trackIterator to find the proper coords

        if (tiAtSelectedSegment == null) {
            debug("no track iterator at selected segment");
            return;
        }

        const isThereANextSegment = tiAtSelectedSegment.next(); // moves the iterator to the next segment and returns true if it worked;
        if (isThereANextSegment) {
            // if the player is changing track types so they can add additional non-standard segments, we can't assume to know the track type they've used at the next coords.
            // debug(`in moveToNextSegment, direction is ${direction}. about to get the next TrackElementItem.
            // The TI says the ride should be found at (${tiAtSelectedSegment.position.x}, ${tiAtSelectedSegment.position.y}, ${tiAtSelectedSegment.position.z}, direction: ${tiAtSelectedSegment.position.direction})`);
            const nextTrackElementItem = finder.getSpecificTrackElement(this.selectedSegment.get()?.get().ride || 0, tiAtSelectedSegment.position)

            // add to nextSegment to create a whole new segment object
            const nextSegment = new Segment({
                location: tiAtSelectedSegment.position,
                ride: nextTrackElementItem.element.ride,
                trackType: nextTrackElementItem.element.trackType,
                rideType: nextTrackElementItem.element.rideType
            });

            this.selectedSegment.set(nextSegment);
            return true;
        }
        return false;
    }

    debugButtonChange(action: any) {
        debug(`button pressed: ${action}`);
    }

    // TODO create a function the deletes the ghost track and the highlighter

    private onSegmentChange = (newSeg: Segment | null): void => {
        storage.storeSelectedSegment(newSeg);
        if (newSeg == null) {
            debug("no segment selected");
            return;
        }

        if (!newSeg?.get().trackType == null) {
            debug("The selected segment has no track type");
        }

        debug(`Segment changed to ${TrackElementType[newSeg?.get().trackType]} at coords (${newSeg?.get().location.x}, ${newSeg?.get().location.y}, ${newSeg?.get().location.z}, direction: ${newSeg?.get().location.direction})`);



        // debug(`about to try repainting the selected segment `);
        const wasPaintOfSelectedSegmentSucessful = this.segmentPainter.paintSelectedSegment(newSeg);

        if (!wasPaintOfSelectedSegmentSucessful) {
            debug(`failed to paint the selected segment!!!!!!!`);
        }

        const newBuildableOptions = builder.getBuildOptionsForSegment(newSeg);
        debug(`After segment change, assessing new buildable options.`);
        const direction = this.buildDirection.get();
        if (direction === "next") {
            debug(`There are ${newBuildableOptions.next.length} buildable options for the next segment`);
            this.buildableTrackTypes.set([...newBuildableOptions.next]);
            return;
        }
        if (direction === "prev") {
            debug(`There are ${newBuildableOptions.previous.length} buildable options for the previous segment`);
            this.buildableTrackTypes.set([...newBuildableOptions.next]);
            return;
        }
        debug(`No direction was set for the buildable segments.This should not happen.`);
        this.buildableTrackTypes.set([]);
    };

    /**
     * Reset build options when the navigation mode is changed to/from forward & backward building modes.
     */
    private onBuildDirectionChange = (newDirection: "next" | "prev" | null): void => {
        if (!newDirection) {
            this.buildableTrackTypes.set([]);
            return;
        }
        const buildableOptions = builder.getBuildOptionsForSegment(this.selectedSegment.get()); //this.ss.getBuildableSegmentOptions();
        if (newDirection === "next") {
            // todo make sure to set nextBuildPosition at the sme time
            this.buildableTrackTypes.set([...buildableOptions.next]);
            return;
        }
        this.buildableTrackTypes.set([...buildableOptions.previous]);

    };

    /**
     * TODO - this is not working. It is not updating the buildable segments when the rotation changes.
     * Recalculate details after rotating an unbuild floating piece
     * (like rotating a single yet-placed station with the standard ride builder)
     */
    private onRotationChange = (rotation: Direction | null): void => {
        // const segment = this.selectedSegment.get();

        // if (segment == null || rotation == null) return;
        // const rotatedSegment = new Segment({
        //     location: { x: segment.location.x, y: segment.location.y, z: segment.location.z,  },
        // })
        // segment.get().location.direction = rotation;
        // // this.ss.updateSegment(segment);
        // // todo make sure to set nextBuildPosition at the sme time
    };

    private onbuildableTrackTypesChange = (newBuildOptions: TrackElementType[]): void => {
        debug(`Buildable segments have changed.`);

        // this is where it might be worthwhile to use another class to do this hard work.
        // todo make it return something better than just the 0th element.
        const recommendedSegment = getSuggestedNextSegment(newBuildOptions, this.selectedSegment.get(), this.selectedBuild.get());

        debug(`The default selected segment is ${TrackElementType[recommendedSegment]}`);

        // try setting to null and then resetting just in case
        this.selectedBuild.set(null);
        this.selectedBuild.set(recommendedSegment);
    };

    private onSelectedBuildChange = (selectedTrackType: TrackElementType | null): void => {
        debug(`onSelectedBuildChange`);
        if (selectedTrackType == null) {
            highlighter.highlightMapRangeUnderSegment(null);
            return;
        }

        debug(`Selected build changed to ${TrackElementType[selectedTrackType]}. Validating then ghost building it.`);
        const segment = this.selectedSegment.get();

        if (segment == null) {
            debug(`selectedBuild changed, but selectedSegment is null. Unable to build a ghost segment.`);
            return;
        }

        // check if there's a next track segment.
        // can use the TI.nextLocation() method to get the next location, but this fails if there's only a ghost piece
        // so the first method uses the TI strategy, and if that fails then it uses a fallback method.
        let trackAtNextBuildLocation = segment.isThereANextSegment("next");
        // debug(`Looking for a track at the next build location. Found: ${JSON.stringify(trackAtNextBuildLocation, null, 2)}`);
        if (trackAtNextBuildLocation.exists == false) {
            debug(`! ! ! ! ! ! ! There is no real track at the next build location. Check if there's a ghost segment.`);
            trackAtNextBuildLocation = finder.doesSegmentHaveNextSegment(segment, selectedTrackType);
        }

        // case: the next location is free~
        if (!trackAtNextBuildLocation.exists) {
            debug(`There was no track at the location of the selected build.Building it now.`);
            builder.buildTrackAtFollowingPosition(segment, "next", selectedTrackType, "ghost", ({ result, newlyBuiltSegment }) => {
                // debug(`Result of building the ghost piece: ${JSON.stringify(result, null, 2)}`);
                this.previewSegment.set(newlyBuiltSegment);
            });
        }



        // case: the next location is occupied by a ghost
        if (trackAtNextBuildLocation.exists === "ghost") {
            debug(`There was a ghost at the location of the selected build.Removing it now.`);
            // remove
            const preExistingSegment = trackAtNextBuildLocation.element?.segment;
            if (!preExistingSegment) {
                debug(`Error: There was a ghost at the location of the selected build, but it could not be found.`);
                return;
            }

            builder.removeTrackAtFollowingPosition(segment, "next", "ghost", (result) => {
                // debug(`Result of removing the ghost piece: ${JSON.stringify(result, null, 2)}`);
            });

            debug(`Ghost removed. Building the new piece now.\n\n\n`);
            builder.buildTrackAtFollowingPosition(segment, "next", selectedTrackType, "ghost", ({ result, newlyBuiltSegment }) => {
                // debug(`Result of building the ghost piece: ${JSON.stringify(result, null, 2)}`);
                if (newlyBuiltSegment) {
                    this.previewSegment.set(newlyBuiltSegment);
                }
            });
            debug(`... and new piece built. seg nextLocation and thisselectedSegment nextLocation: ${JSON.stringify(segment?.nextLocation())}, ${JSON.stringify(this.selectedSegment.get()?.nextLocation())} `);
        }

        // case: the next location is occupied by a real track piece
        if (trackAtNextBuildLocation.exists === "real") {
            debug(`There is a real track piece at the location of the selected build.Cannot build a preview piece here.
            \nExisting segment: ${JSON.stringify(trackAtNextBuildLocation.element?.segment?.get())} `);
            this.selectedBuild.set(null);
            return;
        }

        // todo remove the ghost if this edit window closes
        // todo the ghost will be remove if the build is reselected, but it'd be nice if it were done on subscription of some sort.
    };

    private onNextBuildPositionChange = (newNextBuildPosition: CoordsXYZD | null): void => {
        debug(`next build position changed to ${JSON.stringify(newNextBuildPosition)} `);
    }

    private onPreviewSegmentChange(newPreviewSegment: Segment | null): void {
        debug(`preview segment changed to ${JSON.stringify(newPreviewSegment?.get())} `);
        highlighter.highlightMapRangeUnderSegment(newPreviewSegment);
        storage.storePreviewSegment(newPreviewSegment);
    }
}



