import { useAdjacentEpisodes } from "@/hooks/useAdjacentEpisodes";
import { useCreditSkipper } from "@/hooks/useCreditSkipper";
import { useIntroSkipper } from "@/hooks/useIntroSkipper";
import { useTrickplay } from "@/hooks/useTrickplay";
import { apiAtom } from "@/providers/JellyfinProvider";
import { usePlayback } from "@/providers/PlaybackProvider";
import { useSettings } from "@/utils/atoms/settings";
import { getBackdropUrl } from "@/utils/jellyfin/image/getBackdropUrl";
import { getAuthHeaders } from "@/utils/jellyfin/jellyfin";
import { writeToLog } from "@/utils/log";
import orientationToOrientationLock from "@/utils/OrientationLockConverter";
import { secondsToTicks } from "@/utils/secondsToTicks";
import { formatTimeString, ticksToSeconds } from "@/utils/time";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useRouter, useSegments } from "expo-router";
import * as ScreenOrientation from "expo-screen-orientation";
import { useAtom } from "jotai";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  BackHandler,
  Dimensions,
  Pressable,
  TouchableOpacity,
  View,
} from "react-native";
import { Slider } from "react-native-awesome-slider";
import {
  runOnJS,
  useAnimatedReaction,
  useSharedValue,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Video, { OnProgressData } from "react-native-video";
import { Text } from "./common/Text";
import { itemRouter } from "./common/TouchableItemRouter";
import { Loader } from "./Loader";

const windowDimensions = Dimensions.get("window");
const screenDimensions = Dimensions.get("screen");

export const FullScreenVideoPlayer: React.FC = () => {
  const {
    currentlyPlaying,
    pauseVideo,
    playVideo,
    stopPlayback,
    setIsPlaying,
    isPlaying,
    videoRef,
    onProgress,
    setIsBuffering,
  } = usePlayback();

  const [settings] = useSettings();
  const [api] = useAtom(apiAtom);
  const router = useRouter();
  const segments = useSegments();
  const insets = useSafeAreaInsets();

  const { previousItem, nextItem } = useAdjacentEpisodes({ currentlyPlaying });
  const { trickPlayUrl, calculateTrickplayUrl, trickplayInfo } =
    useTrickplay(currentlyPlaying);

  const [showControls, setShowControls] = useState(true);
  const [isBuffering, setIsBufferingState] = useState(true);
  const [ignoreSafeArea, setIgnoreSafeArea] = useState(false);
  const [orientation, setOrientation] = useState(
    ScreenOrientation.OrientationLock.UNKNOWN
  );

  // Seconds
  const [currentTime, setCurrentTime] = useState(0);
  const [remainingTime, setRemainingTime] = useState(0);

  const isSeeking = useSharedValue(false);

  const cacheProgress = useSharedValue(0);
  const progress = useSharedValue(0);
  const min = useSharedValue(0);
  const max = useSharedValue(currentlyPlaying?.item.RunTimeTicks || 0);

  const [dimensions, setDimensions] = useState({
    window: windowDimensions,
    screen: screenDimensions,
  });

  useEffect(() => {
    const dimensionsSubscription = Dimensions.addEventListener(
      "change",
      ({ window, screen }) => {
        setDimensions({ window, screen });
      }
    );

    const orientationSubscription =
      ScreenOrientation.addOrientationChangeListener((event) => {
        setOrientation(
          orientationToOrientationLock(event.orientationInfo.orientation)
        );
      });

    ScreenOrientation.getOrientationAsync().then((orientation) => {
      setOrientation(orientationToOrientationLock(orientation));
    });

    return () => {
      dimensionsSubscription.remove();
      orientationSubscription.remove();
    };
  }, []);

  const from = useMemo(() => segments[2], [segments]);

  const updateTimes = useCallback(
    (currentProgress: number, maxValue: number) => {
      const current = ticksToSeconds(currentProgress);
      const remaining = ticksToSeconds(maxValue - current);

      setCurrentTime(current);
      setRemainingTime(remaining);
    },
    []
  );

  const { showSkipButton, skipIntro } = useIntroSkipper(
    currentlyPlaying?.item.Id,
    currentTime,
    videoRef
  );

  const { showSkipCreditButton, skipCredit } = useCreditSkipper(
    currentlyPlaying?.item.Id,
    currentTime,
    videoRef
  );

  useAnimatedReaction(
    () => ({
      progress: progress.value,
      max: max.value,
      isSeeking: isSeeking.value,
    }),
    (result) => {
      if (result.isSeeking === false) {
        runOnJS(updateTimes)(result.progress, result.max);
      }
    },
    [updateTimes]
  );

  useEffect(() => {
    const backAction = () => {
      if (currentlyPlaying) {
        Alert.alert("Hold on!", "Are you sure you want to exit?", [
          {
            text: "Cancel",
            onPress: () => null,
            style: "cancel",
          },
          {
            text: "Yes",
            onPress: () => {
              stopPlayback();
              router.back();
            },
          },
        ]);
        return true;
      }
      return false;
    };

    const backHandler = BackHandler.addEventListener(
      "hardwareBackPress",
      backAction
    );

    return () => backHandler.remove();
  }, [currentlyPlaying, stopPlayback, router]);

  const isLandscape = useMemo(() => {
    return orientation === ScreenOrientation.OrientationLock.LANDSCAPE_LEFT ||
      orientation === ScreenOrientation.OrientationLock.LANDSCAPE_RIGHT
      ? true
      : false;
  }, [orientation]);

  const poster = useMemo(() => {
    if (!currentlyPlaying?.item || !api) return "";
    return currentlyPlaying.item.Type === "Audio"
      ? `${api.basePath}/Items/${currentlyPlaying.item.AlbumId}/Images/Primary?tag=${currentlyPlaying.item.AlbumPrimaryImageTag}&quality=90&maxHeight=200&maxWidth=200`
      : getBackdropUrl({
          api,
          item: currentlyPlaying.item,
          quality: 70,
          width: 200,
        });
  }, [currentlyPlaying?.item, api]);

  const videoSource = useMemo(() => {
    if (!api || !currentlyPlaying || !poster) return null;
    const startPosition = currentlyPlaying.item?.UserData?.PlaybackPositionTicks
      ? Math.round(currentlyPlaying.item.UserData.PlaybackPositionTicks / 10000)
      : 0;
    return {
      uri: currentlyPlaying.url,
      isNetwork: true,
      startPosition,
      headers: getAuthHeaders(api),
      metadata: {
        artist: currentlyPlaying.item?.AlbumArtist ?? undefined,
        title: currentlyPlaying.item?.Name || "Unknown",
        description: currentlyPlaying.item?.Overview ?? undefined,
        imageUri: poster,
        subtitle: currentlyPlaying.item?.Album ?? undefined,
      },
    };
  }, [currentlyPlaying, api, poster]);

  useEffect(() => {
    if (currentlyPlaying) {
      progress.value =
        currentlyPlaying.item?.UserData?.PlaybackPositionTicks || 0;
      max.value = currentlyPlaying.item.RunTimeTicks || 0;
      setShowControls(true);
      playVideo();
    }
  }, [currentlyPlaying]);

  const toggleControls = () => setShowControls(!showControls);

  const handleVideoProgress = useCallback(
    (data: OnProgressData) => {
      if (isSeeking.value === true) return;
      progress.value = secondsToTicks(data.currentTime);
      cacheProgress.value = secondsToTicks(data.playableDuration);
      setIsBufferingState(data.playableDuration === 0);
      setIsBuffering(data.playableDuration === 0);
      onProgress(data);
    },
    [onProgress, setIsBuffering, isSeeking]
  );

  const handleVideoError = useCallback(
    (e: any) => {
      console.log(e);
      writeToLog("ERROR", "Video playback error: " + JSON.stringify(e));
      Alert.alert("Error", "Cannot play this video file.");
      setIsPlaying(false);
    },
    [setIsPlaying]
  );

  const handlePlayPause = useCallback(() => {
    if (isPlaying) pauseVideo();
    else playVideo();
  }, [isPlaying, pauseVideo, playVideo]);

  const handleSliderComplete = (value: number) => {
    progress.value = value;
    isSeeking.value = false;
    videoRef.current?.seek(value / 10000000);
  };

  const handleSliderChange = (value: number) => {
    calculateTrickplayUrl(value);
  };

  const handleSliderStart = useCallback(() => {
    if (showControls === false) return;
    isSeeking.value = true;
  }, []);

  const handleSkipBackward = useCallback(async () => {
    if (!settings) return;
    try {
      const curr = await videoRef.current?.getCurrentPosition();
      if (curr !== undefined) {
        videoRef.current?.seek(Math.max(0, curr - settings.rewindSkipTime));
      }
    } catch (error) {
      writeToLog("ERROR", "Error seeking video backwards", error);
    }
  }, [settings]);

  const handleSkipForward = useCallback(async () => {
    if (!settings) return;
    try {
      const curr = await videoRef.current?.getCurrentPosition();
      if (curr !== undefined) {
        videoRef.current?.seek(Math.max(0, curr + settings.forwardSkipTime));
      }
    } catch (error) {
      writeToLog("ERROR", "Error seeking video forwards", error);
    }
  }, [settings]);

  const handleGoToPreviousItem = useCallback(() => {
    if (!previousItem || !from) return;
    const url = itemRouter(previousItem, from);
    stopPlayback();
    // @ts-ignore
    router.push(url);
  }, [previousItem, from, stopPlayback, router]);

  const handleGoToNextItem = useCallback(() => {
    if (!nextItem || !from) return;
    const url = itemRouter(nextItem, from);
    stopPlayback();
    // @ts-ignore
    router.push(url);
  }, [nextItem, from, stopPlayback, router]);

  const toggleIgnoreSafeArea = useCallback(() => {
    setIgnoreSafeArea((prev) => !prev);
  }, []);

  if (!currentlyPlaying) return null;

  return (
    <View
      style={{
        width: dimensions.window.width,
        height: dimensions.window.height,
        backgroundColor: "black",
      }}
    >
      <Pressable
        onPress={toggleControls}
        style={[
          {
            position: "absolute",
            top: 0,
            bottom: 0,
            left: ignoreSafeArea ? 0 : insets.left,
            right: ignoreSafeArea ? 0 : insets.right,
            width: ignoreSafeArea
              ? dimensions.window.width
              : dimensions.window.width - (insets.left + insets.right),
          },
        ]}
      >
        {videoSource && (
          <Video
            ref={videoRef}
            source={videoSource}
            style={{ width: "100%", height: "100%" }}
            resizeMode={ignoreSafeArea ? "cover" : "contain"}
            onProgress={handleVideoProgress}
            onLoad={(data) => (max.value = secondsToTicks(data.duration))}
            onError={handleVideoError}
            playWhenInactive={true}
            allowsExternalPlayback={true}
            playInBackground={true}
            pictureInPicture={true}
            showNotificationControls={true}
            ignoreSilentSwitch="ignore"
            fullscreen={false}
          />
        )}
      </Pressable>

      {(showControls || isBuffering) && (
        <View
          pointerEvents="none"
          style={[
            {
              top: 0,
              left: 0,
              position: "absolute",
              width: dimensions.window.width,
              height: dimensions.window.height,
            },
          ]}
          className="  bg-black/50 z-0"
        ></View>
      )}

      {isBuffering && (
        <View
          pointerEvents="none"
          className="fixed top-0 left-0 w-screen h-screen flex flex-col items-center justify-center"
        >
          <Loader />
        </View>
      )}

      {showSkipButton && (
        <View
          style={[
            {
              position: "absolute",
              bottom: isLandscape ? insets.bottom + 26 : insets.bottom + 70,
              right: isLandscape ? insets.right + 32 : insets.right + 16,
              height: 70,
            },
          ]}
          className="z-10"
        >
          <TouchableOpacity
            onPress={skipIntro}
            className="bg-purple-600 rounded-full px-2.5 py-2 font-semibold"
          >
            <Text className="text-white">Skip Intro</Text>
          </TouchableOpacity>
        </View>
      )}

      {showSkipCreditButton && (
        <View
          style={[
            {
              position: "absolute",
              bottom: isLandscape ? insets.bottom + 26 : insets.bottom + 70,
              right: isLandscape ? insets.right + 32 : insets.right + 16,
              height: 70,
            },
          ]}
          className="z-10"
        >
          <TouchableOpacity
            onPress={skipCredit}
            className="bg-purple-600 rounded-full px-2.5 py-2 font-semibold"
          >
            <Text className="text-white">Skip Credits</Text>
          </TouchableOpacity>
        </View>
      )}

      {showControls && (
        <>
          <View
            style={[
              {
                position: "absolute",
                top: insets.top,
                right: isLandscape ? insets.right + 32 : insets.right + 16,
                height: 70,
                zIndex: 10,
              },
            ]}
            className="flex flex-row items-center space-x-2 z-10"
          >
            <TouchableOpacity
              onPress={toggleIgnoreSafeArea}
              className="aspect-square flex flex-col bg-neutral-800 rounded-xl items-center justify-center p-2"
            >
              <Ionicons
                name={ignoreSafeArea ? "contract-outline" : "expand"}
                size={24}
                color="white"
              />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => {
                stopPlayback();
                router.back();
              }}
              className="aspect-square flex flex-col bg-neutral-800 rounded-xl items-center justify-center p-2"
            >
              <Ionicons name="close" size={24} color="white" />
            </TouchableOpacity>
          </View>

          <View
            style={[
              {
                position: "absolute",
                bottom: insets.bottom + 8,
                left: isLandscape ? insets.left + 32 : insets.left + 16,
                width: isLandscape
                  ? dimensions.window.width - insets.left - insets.right - 64
                  : dimensions.window.width - insets.left - insets.right - 32,
              },
            ]}
          >
            <View className="shrink flex flex-col justify-center h-full mb-2">
              <Text className="font-bold">{currentlyPlaying.item?.Name}</Text>
              {currentlyPlaying.item?.Type === "Episode" && (
                <Text className="opacity-50">
                  {currentlyPlaying.item.SeriesName}
                </Text>
              )}
              {currentlyPlaying.item?.Type === "Movie" && (
                <Text className="text-xs opacity-50">
                  {currentlyPlaying.item?.ProductionYear}
                </Text>
              )}
              {currentlyPlaying.item?.Type === "Audio" && (
                <Text className="text-xs opacity-50">
                  {currentlyPlaying.item?.Album}
                </Text>
              )}
            </View>
            <View
              className={`flex ${
                isLandscape
                  ? "flex-row space-x-6 py-2 px-4 rounded-full"
                  : "flex-col-reverse py-4 px-4 rounded-2xl"
              } 
          items-center  bg-neutral-800`}
            >
              <View className="flex flex-row items-center space-x-4">
                <TouchableOpacity
                  style={{
                    opacity: !previousItem ? 0.5 : 1,
                  }}
                  onPress={handleGoToPreviousItem}
                >
                  <Ionicons name="play-skip-back" size={24} color="white" />
                </TouchableOpacity>
                <TouchableOpacity onPress={handleSkipBackward}>
                  <Ionicons
                    name="refresh-outline"
                    size={26}
                    color="white"
                    style={{
                      transform: [{ scaleY: -1 }, { rotate: "180deg" }],
                    }}
                  />
                </TouchableOpacity>
                <TouchableOpacity onPress={handlePlayPause}>
                  <Ionicons
                    name={isPlaying ? "pause" : "play"}
                    size={30}
                    color="white"
                  />
                </TouchableOpacity>
                <TouchableOpacity onPress={handleSkipForward}>
                  <Ionicons name="refresh-outline" size={26} color="white" />
                </TouchableOpacity>
                <TouchableOpacity
                  style={{
                    opacity: !nextItem ? 0.5 : 1,
                  }}
                  onPress={handleGoToNextItem}
                >
                  <Ionicons name="play-skip-forward" size={24} color="white" />
                </TouchableOpacity>
              </View>
              <View
                className={`flex flex-col w-full shrink
              ${""}
            `}
              >
                <Slider
                  theme={{
                    maximumTrackTintColor: "rgba(255,255,255,0.2)",
                    minimumTrackTintColor: "#fff",
                    cacheTrackTintColor: "rgba(255,255,255,0.3)",
                    bubbleBackgroundColor: "#fff",
                    bubbleTextColor: "#000",
                    heartbeatColor: "#999",
                  }}
                  cache={cacheProgress}
                  onSlidingStart={handleSliderStart}
                  onSlidingComplete={handleSliderComplete}
                  onValueChange={handleSliderChange}
                  containerStyle={{
                    borderRadius: 100,
                  }}
                  renderBubble={() => {
                    if (!trickPlayUrl || !trickplayInfo) {
                      return null;
                    }
                    const { x, y, url } = trickPlayUrl;

                    const tileWidth = 150;
                    const tileHeight = 150 / trickplayInfo.aspectRatio!;
                    return (
                      <View
                        style={{
                          position: "absolute",
                          bottom: 0,
                          left: 0,
                          width: tileWidth,
                          height: tileHeight,
                          marginLeft: -tileWidth / 4,
                          marginTop: -tileHeight / 4 - 60,
                          zIndex: 10,
                        }}
                        className=" bg-neutral-800 overflow-hidden"
                      >
                        <Image
                          cachePolicy={"memory-disk"}
                          style={{
                            width: 150 * trickplayInfo?.data.TileWidth!,
                            height:
                              (150 / trickplayInfo.aspectRatio!) *
                              trickplayInfo?.data.TileHeight!,
                            transform: [
                              { translateX: -x * tileWidth },
                              { translateY: -y * tileHeight },
                            ],
                          }}
                          source={{ uri: url }}
                          contentFit="cover"
                        />
                      </View>
                    );
                  }}
                  sliderHeight={10}
                  thumbWidth={0}
                  progress={progress}
                  minimumValue={min}
                  maximumValue={max}
                />
                <View className="flex flex-row items-center justify-between mt-0.5">
                  <Text className="text-[12px] text-neutral-400">
                    {formatTimeString(currentTime)}
                  </Text>
                  <Text className="text-[12px] text-neutral-400">
                    -{formatTimeString(remainingTime)}
                  </Text>
                </View>
              </View>
            </View>
          </View>
        </>
      )}
    </View>
  );
};
