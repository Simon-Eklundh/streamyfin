import ios from "@/utils/profiles/ios";
import { Api } from "@jellyfin/sdk";
import {
  BaseItemDto,
  MediaSourceInfo,
  PlaybackInfoResponse,
} from "@jellyfin/sdk/lib/generated-client/models";
import { getAuthHeaders } from "../jellyfin";

export const getStreamUrl = async ({
  api,
  item,
  userId,
  startTimeTicks = 0,
  maxStreamingBitrate,
  sessionData,
  deviceProfile = ios,
  audioStreamIndex = 0,
  subtitleStreamIndex = undefined,
  forceDirectPlay = false,
  height,
  mediaSourceId,
}: {
  api: Api | null | undefined;
  item: BaseItemDto | null | undefined;
  userId: string | null | undefined;
  startTimeTicks: number;
  maxStreamingBitrate?: number;
  sessionData: PlaybackInfoResponse;
  deviceProfile: any;
  audioStreamIndex?: number;
  subtitleStreamIndex?: number;
  forceDirectPlay?: boolean;
  height?: number;
  mediaSourceId: string | null;
}) => {
  if (!api || !userId || !item?.Id || !mediaSourceId) {
    return null;
  }

  const itemId = item.Id;

  /**
   * Build the stream URL for videos
   */
  const response = await api.axiosInstance.post(
    `${api.basePath}/Items/${itemId}/PlaybackInfo`,
    {
      DeviceProfile: deviceProfile,
      UserId: userId,
      MaxStreamingBitrate: maxStreamingBitrate,
      StartTimeTicks: startTimeTicks,
      EnableTranscoding: maxStreamingBitrate ? true : undefined,
      AutoOpenLiveStream: true,
      MediaSourceId: mediaSourceId,
      AllowVideoStreamCopy: maxStreamingBitrate ? false : true,
      AudioStreamIndex: audioStreamIndex,
      SubtitleStreamIndex: subtitleStreamIndex,
      DeInterlace: true,
      BreakOnNonKeyFrames: false,
      CopyTimestamps: false,
      EnableMpegtsM2TsMode: false,
    },
    {
      headers: getAuthHeaders(api),
    }
  );

  const mediaSource: MediaSourceInfo = response.data.MediaSources.find(
    (source: MediaSourceInfo) => source.Id === mediaSourceId
  );

  if (!mediaSource) {
    throw new Error("No media source");
  }

  if (!sessionData.PlaySessionId) {
    throw new Error("no PlaySessionId");
  }

  let url: string | null | undefined;

  if (mediaSource.SupportsDirectPlay || forceDirectPlay === true) {
    if (item.MediaType === "Video") {
      url = `${api.basePath}/Videos/${itemId}/stream.mp4?playSessionId=${sessionData.PlaySessionId}&mediaSourceId=${mediaSource.Id}&static=true&subtitleStreamIndex=${subtitleStreamIndex}&audioStreamIndex=${audioStreamIndex}&deviceId=${api.deviceInfo.id}&api_key=${api.accessToken}`;
    } else if (item.MediaType === "Audio") {
      const searchParams = new URLSearchParams({
        UserId: userId,
        DeviceId: api.deviceInfo.id,
        MaxStreamingBitrate: "140000000",
        Container:
          "opus,webm|opus,mp3,aac,m4a|aac,m4b|aac,flac,webma,webm|webma,wav,ogg",
        TranscodingContainer: "mp4",
        TranscodingProtocol: "hls",
        AudioCodec: "aac",
        api_key: api.accessToken,
        PlaySessionId: sessionData.PlaySessionId,
        StartTimeTicks: "0",
        EnableRedirection: "true",
        EnableRemoteMedia: "false",
      });
      url = `${
        api.basePath
      }/Audio/${itemId}/universal?${searchParams.toString()}`;
    }
  } else if (mediaSource.TranscodingUrl) {
    url = `${api.basePath}${mediaSource.TranscodingUrl}`;
  }

  if (!url) throw new Error("No url");

  console.log(
    mediaSource.VideoType,
    mediaSource.Container,
    mediaSource.TranscodingContainer,
    mediaSource.TranscodingSubProtocol
  );

  return url;
};
