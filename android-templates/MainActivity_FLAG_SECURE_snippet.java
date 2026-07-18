// 可选：防截屏 / 最近任务预览隐藏（接近 Signal）
// 文件: android/app/src/main/java/.../MainActivity.java
// 在 onCreate 里 setContentView 之前或之后加入:

/*
import android.view.WindowManager;

@Override
public void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
    getWindow().setFlags(
        WindowManager.LayoutParams.FLAG_SECURE,
        WindowManager.LayoutParams.FLAG_SECURE
    );
}
*/
