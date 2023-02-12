import { store, Store } from "openrct2-flexui";
import * as Log from "../utilities/logger"
import { ParkRide } from "./parkRide";
import { PaintEndProps, PaintStartProps, TrainModePropertiesObj, ColourSet } from "./trainModeProps";
import { propStorage as storage } from '../services/preferenceSerializer';

export type PaintMode = "train" | "tail";

export const paintModes: PaintMode[] = ["train", "tail"];

export type NumberOfSetsOrColours = 1 | 2 | 3;

export const propKeyStrings: Record<PaintEndProps | PaintStartProps | PaintMode | NumberOfSetsOrColours, string> = {
    "afterFirstCar": "After first car",
    "afterLastCar": "After last car",
    "perpetual": "Perpetual",
    "afterNSegments": "After N segments",
    "withFirstCar": "With first car",
    "train": "Train Mode",
    "tail": "Tail Mode",
    1: "1",
    2: "2",
    3: "3",
} as const;

export type TailProps = {
    tailColours: {
        main: number,
        additional: number,
        supports: number
    };
    tailLength: number;
};

export interface TailModeProps {
    numberOfTailColours: NumberOfSetsOrColours,
    paintStart: PaintStartProps,
    tailProps: TailProps[],
}

export type PaintProps = {
    ride: [ParkRide, number],
    colouringEnabled: boolean,
    mode: PaintMode,
    trainModeProps: TrainModePropertiesObj;
    tailModeProps: TailModeProps;
};

const defaultTailColourProps: TailProps[] = [
    {
        tailColours: {
            main: 26,
            additional: 21,
            supports: 26
        },
        tailLength: 3,
    },
    {
        tailColours: {
            main: 21,
            additional: 20,
            supports: 21
        },
        tailLength: 2,
    },
    {
        tailColours: {
            main: 20,
            additional: 19,
            supports: 20
        },
        tailLength: 1,
    }
];

const defaultTailModeProps: TailModeProps = {
    numberOfTailColours: 3,
    paintStart: "afterLastCar",
    tailProps: defaultTailColourProps
};

export class PaintPropsObj {
    readonly rideStore = store<[ParkRide, number] | null>(null);
    readonly colouringEnabledStore = store<boolean>(false);
    readonly modeStore: Store<PaintMode> = store<PaintMode>("train");
    readonly tailModeProps: Store<TailModeProps> = store<TailModeProps>(defaultTailModeProps);
    readonly trainModeProps = new TrainModePropertiesObj();

    private propChangeCallback: (props: PaintProps) => void;

    constructor(propChangeCallback: (props: PaintProps) => void) {
        this.propChangeCallback = propChangeCallback;
        // make sure to save on colourSet change
        this.trainModeProps.colourSets.subscribe((_colourSets: ColourSet[]): void => {
            Log.debug(`Saving colourSets on change.`);
            this.saveProps();
        });

        this.trainModeProps.numberVehicleSets.subscribe((_numberVehicleSets): void => {
            this.saveProps();
        });
    }

    get ride(): [ParkRide, number] | null {
        return this.rideStore.get();
    }

    set ride(ride: [ParkRide, number] | null) {
        this.rideStore.set(ride);

        const savedValues = storage.getRideProps(ride ? ride[0].id : undefined);
        if (!savedValues) { // set default values]
            Log.debug(`No saved values for ride ${ride ? ride[0].id : undefined} - setting default values.`);
            this.resetValues();
            return;
        }

        Log.debug(`In set Ride, Loaded colourSet`);
        savedValues.trainModeProps.prettyPrintVehicleColours();

        // set the loaded values
        this.colouringEnabled = savedValues.colouringEnabled;
        this.mode = savedValues.mode;
        this.trainModeProps.setFromExistingProps(savedValues.trainModeProps);

        // this.tailModeProps.set(savedValues.tailModeProps);
        this.saveProps();
    }

    setFromExistingProps(props: PaintProps): void {
        this.rideStore.set(props.ride);
        this.colouringEnabledStore.set(props.colouringEnabled);
        this.modeStore.set(props.mode);
        this.trainModeProps.setFromExistingProps(props.trainModeProps);
        this.tailModeProps.set(props.tailModeProps);

        this.saveProps();
    }

    set mode(mode: PaintMode) {
        this.modeStore.set(mode);
        this.saveProps();
    }

    get mode(): PaintMode {
        return this.modeStore.get();
    }

    set colouringEnabled(enabled: boolean) {
        this.colouringEnabledStore.set(enabled);
        this.saveProps();
    }

    get colouringEnabled(): boolean {
        return this.colouringEnabledStore.get();
    }

    updateTailModeProps(props: TailModeProps): void {
        this.tailModeProps.set(props);
        this.saveProps();
    }

    resetValues(): void {
        // don't reset the ride
        this.colouringEnabled = false;
        this.mode = "train";
        this.trainModeProps.reset();
        // this.tailModeProps.set(defaultTailModeProps);
        this.saveProps();
    }

    saveProps(): void {
        if (!this.ride) {
            Log.debug(`Attempted to save, but no ride was selected.`);
            return;
        }

        const props: PaintProps = {
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            ride: this.ride,
            colouringEnabled: this.colouringEnabled,
            mode: this.mode,
            trainModeProps: this.trainModeProps,
            tailModeProps: this.tailModeProps.get(),
        };

        storage.saveRideProps(props);
        this.propChangeCallback(props);
    }
}
