import { NextResponse } from "next/server";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: taskId } = await params; 
   
    const taskResponse = await fetch(
      `https://api.vidu.com/ent/v2/tasks/${taskId}/creations`,
      {
        method: "GET",
        headers: {
          Authorization: `Token ${process.env.VIDU_API_KEY}`,
        },
      }
    );

    const rawText = await taskResponse.text();
    console.log(`查询任务 ${taskId}:`, rawText);

    let taskResult;
    try {
      taskResult = JSON.parse(rawText);
    } catch (e) {
      return NextResponse.json(
        { error: "返回非 JSON", raw: rawText },
        { status: 500 }
      );
    }

	return NextResponse.json({
	state: taskResult.state,
	progress: taskResult.progress,
	creations: taskResult.creations?.map((c: any) => ({ url: c.url || c.video_url })),
	err_msg: taskResult.err_msg,
	});

  } catch (error: any) {
    console.error(error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
