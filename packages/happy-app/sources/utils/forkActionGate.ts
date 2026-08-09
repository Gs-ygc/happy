let latestForkAction = 0;

export type ForkActionClaim = {
    isCurrent: () => boolean;
    release: () => void;
};

export function claimForkAction(): ForkActionClaim {
    const id = ++latestForkAction;
    let released = false;

    return {
        isCurrent: () => !released && id === latestForkAction,
        release: () => {
            released = true;
        },
    };
}
