// GitHub 综合战力同步 - Supabase Edge Function (Deno)
// 使用 provider_token 或 GITHUB_TOKEN 调用 GitHub GraphQL，计算得分后仅由 Service Role 写入

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const GITHUB_GRAPHQL = "https://api.github.com/graphql";
const COOLDOWN_MS = 24 * 60 * 60 * 1000;

const REPO_STATS_QUERY = `
query RepoStats($login: String!, $after: String) {
  user(login: $login) {
    repositories(ownerAffiliations: OWNER, first: 100, after: $after) {
      pageInfo { hasNextPage endCursor }
      nodes {
        stargazerCount
        forkCount
        watchers { totalCount }
      }
    }
    followers { totalCount }
  }
}
`;

type RepoNode = {
  stargazerCount: number;
  forkCount: number;
  watchers: { totalCount: number };
};

type GraphQLResponse = {
  data?: {
    user: {
      repositories: {
        pageInfo: { hasNextPage: boolean; endCursor: string | null };
        nodes: RepoNode[];
      };
      followers: { totalCount: number };
    } | null;
  };
  errors?: Array<{ message: string }>;
};

function score(stars: number, forks: number, watchers: number, followers: number): number {
  return stars * 10 + forks * 5 + watchers * 2 + followers * 1;
}

async function fetchGitHubStats(login: string, token: string): Promise<{
  stars: number;
  forks: number;
  watchers: number;
  followers: number;
} | { error: string }> {
  let stars = 0,
    forks = 0,
    watchers = 0,
    followers = 0;
  let after: string | null = null;

  do {
    const res = await fetch(GITHUB_GRAPHQL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: REPO_STATS_QUERY,
        variables: { login, after },
      }),
    });

    if (res.status === 403) {
      const remaining = res.headers.get("X-RateLimit-Remaining");
      if (remaining === "0") {
        const reset = res.headers.get("X-RateLimit-Reset");
        return {
          error: `API rate limit exceeded, retry after ${reset ? new Date(Number(reset) * 1000).toISOString() : "later"}`,
        };
      }
    }

    if (!res.ok) {
      const text = await res.text();
      return { error: `GitHub API ${res.status}: ${text.slice(0, 200)}` };
    }

    const json: GraphQLResponse = await res.json();
    if (json.errors?.length) {
      return { error: json.errors.map((e) => e.message).join("; ") };
    }

    const user = json.data?.user;
    if (!user) {
      return { error: "User not found or no data" };
    }

    followers = user.followers.totalCount;
    for (const node of user.repositories.nodes) {
      stars += node.stargazerCount;
      forks += node.forkCount;
      watchers += node.watchers.totalCount;
    }

    const next = user.repositories.pageInfo;
    if (!next.hasNextPage) break;
    after = next.endCursor;
  } while (after);

  return { stars, forks, watchers, followers };
}

Deno.serve(async (req) => {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing Authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? supabaseServiceKey;
    const isServiceRole = authHeader.replace(/^Bearer\s+/i, "") === supabaseServiceKey;

    let userId: string;
    let githubLogin: string;
    let token: string;

    const body = await req.json().catch(() => ({})) as { userId?: string; providerToken?: string };

    if (isServiceRole && body.userId) {
      userId = body.userId;
      const admin = createClient(supabaseUrl, supabaseServiceKey);
      const { data: row, error: fetchError } = await admin
        .from("user_analysis")
        .select("github_login")
        .eq("id", userId)
        .single();
      if (fetchError || !row?.github_login) {
        return new Response(
          JSON.stringify({ error: "User not found or no github_login" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      githubLogin = row.github_login;
      token = Deno.env.get("GITHUB_TOKEN") ?? "";
      if (!token) {
        return new Response(
          JSON.stringify({ error: "GITHUB_TOKEN not set for server-side sync" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    } else {
      const supabase = createClient(supabaseUrl, supabaseAnonKey, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: { user: authUser }, error: authError } = await supabase.auth.getUser(
        authHeader.replace(/^Bearer\s+/i, "")
      );
      if (authError || !authUser) {
        return new Response(
          JSON.stringify({ error: "Unauthorized or invalid token" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      userId = authUser.id;

      // 前端从 session.provider_token 取出并传入（服务端 JWT 不包含 provider_token）
      const providerToken = body.providerToken ?? "";
      if (!providerToken) {
        return new Response(
          JSON.stringify({ error: "GitHub provider token not available; pass providerToken from session" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      token = providerToken;
      githubLogin = authUser.user_metadata?.user_name ?? authUser.email?.split("@")[0] ?? "";
      if (!githubLogin) {
        const { data: profile } = await supabase.from("user_analysis").select("user_name, github_login").eq("id", userId).single();
        githubLogin = profile?.github_login ?? profile?.user_name ?? "";
      }
      if (!githubLogin) {
        return new Response(
          JSON.stringify({ error: "Could not determine GitHub login" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const admin = createClient(supabaseUrl, supabaseServiceKey);
      const { data: u } = await admin.from("user_analysis").select("github_synced_at").eq("id", userId).single();
      if (u?.github_synced_at) {
        const next = new Date(u.github_synced_at).getTime() + COOLDOWN_MS;
        if (Date.now() < next) {
          return new Response(
            JSON.stringify({ error: "Sync cooldown active, try after 24h" }),
            { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }
    }

    const stats = await fetchGitHubStats(githubLogin, token);
    if ("error" in stats) {
      return new Response(
        JSON.stringify({ error: stats.error }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const githubScore = score(stats.stars, stats.forks, stats.watchers, stats.followers);
    const admin = createClient(supabaseUrl, supabaseServiceKey);
    const { error: updateError } = await admin
      .from("user_analysis")
      .update({
        github_stars: stats.stars,
        github_forks: stats.forks,
        github_watchers: stats.watchers,
        github_followers: stats.followers,
        github_score: githubScore,
        github_synced_at: new Date().toISOString(),
        github_login: githubLogin,
      })
      .eq("id", userId);

    if (updateError) {
      return new Response(
        JSON.stringify({ error: updateError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        ok: true,
        github_score: githubScore,
        github_stars: stats.stars,
        github_forks: stats.forks,
        github_watchers: stats.watchers,
        github_followers: stats.followers,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : String(e) }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
});
