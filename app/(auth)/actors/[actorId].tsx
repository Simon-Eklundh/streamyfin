import { Bitrate } from "@/components/BitrateSelector";
import { Loader } from "@/components/Loader";
import { OverviewText } from "@/components/OverviewText";
import { Ratings } from "@/components/Ratings";
import { Text } from "@/components/common/Text";
import { MoviesTitleHeader } from "@/components/movies/MoviesTitleHeader";
import { SeriesTitleHeader } from "@/components/series/SeriesTitleHeader";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import { useSettings } from "@/utils/atoms/settings";
import { getBackdropUrl } from "@/utils/jellyfin/image/getBackdropUrl";
import { getLogoImageUrlById } from "@/utils/jellyfin/image/getLogoImageUrlById";
import { getStreamUrl } from "@/utils/jellyfin/media/getStreamUrl";
import { getUserItemData } from "@/utils/jellyfin/user-library/getUserItemData";
import { chromecastProfile } from "@/utils/profiles/chromecast";
import ios from "@/utils/profiles/ios";
import native from "@/utils/profiles/native";
import old from "@/utils/profiles/old";
import { getItemsApi, getMediaInfoApi } from "@jellyfin/sdk/lib/utils/api";
import { useQuery } from "@tanstack/react-query";
import { Image } from "expo-image";
import { useLocalSearchParams } from "expo-router";
import { useAtom } from "jotai";
import { useCallback, useMemo, useState } from "react";
import { View } from "react-native";
import { useCastDevice } from "react-native-google-cast";
import { ParallaxScrollView } from "../../../components/ParallaxPage";
import { InfiniteHorizontalScroll } from "@/components/common/InfiniteHorrizontalScroll";
import { TouchableItemRouter } from "@/components/common/TouchableItemRouter";
import MoviePoster from "@/components/posters/MoviePoster";
import { ItemCardText } from "@/components/ItemCardText";
import { BaseItemDtoQueryResult } from "@jellyfin/sdk/lib/generated-client/models";

const page: React.FC = () => {
  const local = useLocalSearchParams();
  const { actorId } = local as { actorId: string };

  const [api] = useAtom(apiAtom);
  const [user] = useAtom(userAtom);

  const { data: item, isLoading: l1 } = useQuery({
    queryKey: ["item", actorId],
    queryFn: async () =>
      await getUserItemData({
        api,
        userId: user?.Id,
        itemId: actorId,
      }),
    enabled: !!actorId && !!api,
    staleTime: 60,
  });

  const fetchItems = useCallback(
    async ({
      pageParam,
    }: {
      pageParam: number;
    }): Promise<BaseItemDtoQueryResult | null> => {
      if (!api || !user?.Id) return null;

      const response = await getItemsApi(api).getItems({
        userId: user.Id,
        personIds: [actorId],
        startIndex: pageParam,
        limit: 8,
        sortOrder: ["Descending", "Descending", "Ascending"],
        includeItemTypes: ["Movie", "Series"],
        recursive: true,
        fields: [
          "ParentId",
          "PrimaryImageAspectRatio",
          "ParentId",
          "PrimaryImageAspectRatio",
        ],
        sortBy: ["PremiereDate", "ProductionYear", "SortName"],
        collapseBoxSetItems: false,
      });

      return response.data;
    },
    [api, user?.Id, actorId]
  );

  const backdropUrl = useMemo(
    () =>
      getBackdropUrl({
        api,
        item,
        quality: 90,
        width: 1000,
      }),
    [item]
  );

  if (l1)
    return (
      <View className="justify-center items-center h-full">
        <Loader />
      </View>
    );

  if (!item?.Id || !backdropUrl) return null;

  return (
    <ParallaxScrollView
      headerImage={
        <Image
          source={{
            uri: backdropUrl,
          }}
          style={{
            width: "100%",
            height: "100%",
          }}
        />
      }
    >
      <View className="flex flex-col space-y-4 my-4">
        <View className="px-4 mb-4">
          <MoviesTitleHeader item={item} className="mb-4" />
          <OverviewText text={item.Overview} />
        </View>

        <Text className="px-4 text-2xl font-bold mb-2 text-neutral-100">
          Appeared In
        </Text>
        <InfiniteHorizontalScroll
          height={247}
          renderItem={(i, idx) => (
            <TouchableItemRouter
              key={idx}
              item={i}
              className={`flex flex-col
              ${"w-28"}
            `}
            >
              <View>
                <MoviePoster item={i} />
                <ItemCardText item={i} />
              </View>
            </TouchableItemRouter>
          )}
          queryFn={fetchItems}
          queryKey={["actor", "movies", actorId]}
        />
        <View className="h-12"></View>
      </View>
    </ParallaxScrollView>
  );
};

export default page;
