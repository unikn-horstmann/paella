
import { DomClass, createElementWithHtmlText,createElement } from 'paella/core/dom';
import { getValidLayouts, getValidContentIds, getLayoutStructure } from 'paella/core/VideoLayout';
import { getVideoPlugin } from 'paella/core/VideoPlugin';
import StreamProvider from 'paella/core/StreamProvider';
import { resolveResourcePath } from 'paella/core/utils';

import 'styles/VideoContainer.css';
import 'styles/VideoLayout.css';

export async function getContainerBaseSize(player) {
    // TODO: In the future, this function can be modified to support different
    // aspect ratios, which can be loaded from the video manifest.
    return { w: 1280, h: 720 }
}

function getStreamWithContent(streamData, content) {
    const result = streamData.filter(sd => sd.content === content);
    return result.length >= 1 ? result[0] : null;
}

export default class VideoContainer extends DomClass {

    constructor(player, parent) {
        const baseVideoRectClass = "base-video-rect";

        const attributes = {
            "class": "video-container",
            "style": "position: relative;"
        };
        const children = `
            <div class="${ baseVideoRectClass }">
            </div>
        `
        super(player, {attributes, children, parent});

        this._baseVideoRect = this.element.getElementsByClassName(baseVideoRectClass)[0];
        this._baseVideoRect.addEventListener("click", async () => {
            if (await this.paused()) {
                await this.play();
            }
            else {
                await this.pause();
            }
        });

        this._ready = false;

        this._layoutId = player.config.defaultLayout;

        this._players = [];
        
        this._streamProvider = new StreamProvider(this.player, this.baseVideoRect);
    }

    get layoutId() {
        return this._layoutId;
    }
    
    async setLayout(layoutId) {
        if (this.validContentIds.indexOf(layoutId) === -1) {
            return false;
        }
        else {
            this._layoutId = layoutId;
            this.updateLayout();
        }
    }
    
    get validContentIds() {
        return this._validContentIds;
    }

    get baseVideoRect() {
        return this._baseVideoRect;
    }
    
    get streamProvider() {
        return this._streamProvider;
    }

    async load(streamData) {
        
        await this.streamProvider.load(streamData);
        
        // Find the content identifiers that are compatible with the stream data
        this._validContentIds = getValidContentIds(this.player, streamData);
        
        // Load video layout
        await this.updateLayout();
        
        this._ready = true;
    }

    // Return true if the layout this.layoutId is compatible with the current stream data.
    async updateLayout() {
        let status = true;
        
        
        // Current layout: if not selected, or the selected layout is not compatible, load de default layout
        if (!this._layoutId || this._validContentIds.indexOf(this._layoutId) === -1) {
            // TODO: check if the default layout can be applied to the stream data
            this._layoutId = this._validContentIds[0];
            status = false;
        }

        const layoutStructure = getLayoutStructure(this.player, this.streamProvider.streamData, this._layoutId);

        // Hide all video players
        for (const key in this.streamProvider.streams) {
            const videoData = this.streamProvider.streams[key];
            videoData.player.video.style.display = "none";
        }

        // Conversion factors for video rect
        const baseSize = await getContainerBaseSize(this.player);
        const playerSize = this.player.containerSize;
        const wFactor = 100 / baseSize.w;
        const hFactor = 100 / baseSize.h;
        const playerRatio = playerSize.w / playerSize.h;
        const baseRatio = baseSize.w / baseSize.h; 
        const containerCurrentSize = playerRatio>baseRatio ?
            { w: playerSize.h * baseRatio, h: playerSize.h } :
            { w: playerSize.w, h: playerSize.w / baseRatio };

        this.baseVideoRect.style.width = containerCurrentSize.w;
        this.baseVideoRect.style.height = containerCurrentSize.h;

        layoutStructure?.videos?.forEach(async video => {
            const videoData = this.streamProvider.streams[video.content];
            const { stream } = videoData;
            const { player } = videoData;
            console.log(video);
            console.log(player);
            console.log(stream);

            const res = await player.getDimensions();
            const videoAspectRatio = res.w / res.h;  // TODO: Get video aspect ratio
            let difference = Number.MAX_VALUE;
            let resultRect = null;
            
            video.rect.forEach((videoRect) => {
                const aspectRatioData = /^(\d+.?\d*)\/(\d+.?\d*)$/.exec(videoRect.aspectRatio);
                const rectAspectRatio = aspectRatioData ? Number(aspectRatioData[1]) / Number(aspectRatioData[2]) : 1;
                const d = Math.abs(videoAspectRatio - rectAspectRatio);
                if (d < difference) {
                    resultRect = videoRect;
                    difference = d;
                }
            });

            player.video.style.display = "block";
            player.video.style.position = "absolute";
            player.video.style.left = `${ resultRect.left * wFactor }%`;
            player.video.style.top = `${ resultRect.top * hFactor }%`;
            player.video.style.width = `${ resultRect.width * wFactor }%`;
            player.video.style.height = `${ resultRect.height * hFactor }%`;
            player.video.style.zIndex = video.layer;
            
        });
        
        const prevButtons = this.baseVideoRect.getElementsByClassName('video-layout-button');
        Array.from(prevButtons).forEach(btn => this.baseVideoRect.removeChild(btn));
        layoutStructure?.buttons?.forEach(buttonData => {
            const button = createElement({
                tag: 'button',
                attributes: {
                    "class": "video-layout-button",
                    style: `
                    left: ${buttonData.rect.left * wFactor}%;
                    top: ${buttonData.rect.top * hFactor}%;
                    width: ${buttonData.rect.width * wFactor}%;
                    height: ${buttonData.rect.height * hFactor}%;
                    z-index: ${ buttonData.layer };
                    `
                },
                parent: this.baseVideoRect,
                children: buttonData.icon
            });
            button.layout = layoutStructure;
            button.buttonAction = buttonData.onClick;
            button.addEventListener("click", (evt) => {
                evt.target.buttonAction.apply(evt.target.layout);
                evt.stopPropagation();
            });
        });
        
        return status;
    }

    get ready() {
        return this._ready;
    }

    async play() {
        this.streamProvider.startStreamSync();
        return await this.streamProvider.executeAction("play");
    }

    async pause() {
        this.streamProvider.stopStreamSync();
        return await this.streamProvider.executeAction("pause");
    }
    
    async paused() {
        return (await this.streamProvider.executeAction("paused"))[0];
    }

    async setCurrentTime(t) {
        return (await this.streamProvider.executeAction("setCurrentTime", [t]))[0];
    }
    
    async currentTime() {
        return (await this.streamProvider.executeAction("currentTime"))[0];
    }
    
    async volume() {
        return (await this.streamProvider.executeAction("volume"))[0];
    }
    
    async setVolume(v) {
        return (await this.streamProvider.executeAction("setVolume",[v]))[0];
    }
}

