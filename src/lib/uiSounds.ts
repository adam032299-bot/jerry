export const playMenuClickSound = () => {
    // PLAY.wav is located in the public directory
    const clickSound = new Audio('/PLAY.wav');
    clickSound.volume = 0.5; // Adjust volume as needed, 0.8 might be too loud
    clickSound.currentTime = 0; // Ensure overlapping is supported
    clickSound.play().catch(err => console.warn("Menu click sound play failed:", err));
};

export const playNpcSaySound = () => {
    // say.mp3 is located in the public directory
    const saySound = new Audio('/say.mp3');
    saySound.volume = 0.8; // Increased from 0.5 to 0.8
    saySound.currentTime = 0;
    saySound.play().catch(err => console.warn("NPC say sound play failed:", err));
};

export const playItemGetSound = () => {
    // get.mp3 is located in the public directory
    const getSound = new Audio('/get.mp3');
    getSound.volume = 0.8; 
    getSound.currentTime = 0;
    getSound.play().catch(err => console.warn("Item get sound play failed:", err));
};
